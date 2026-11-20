import path from 'node:path'
import zlib from 'node:zlib'
import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import { parse, writeUncompressed } from 'prismarine-nbt'
import { BrowserWindow, dialog } from 'electron'
import { msg } from './i18n'
import { dirs, savesDir } from './paths'
import { downloadMany } from './downloader'
import { getProjectVersions } from './modrinth'
import { fetchJson } from './http'
import { emitToast, uid } from './events'
import { getState } from './store'
import type { ModrinthProject, WorldInfo } from '@shared/types'

/** Search Modrinth for datapacks that actually generate worlds. */
export async function searchWorlds(query: string): Promise<ModrinthProject[]> {
  const params = new URLSearchParams({
    query,
    limit: '18',
    index: 'downloads',
    facets: JSON.stringify([['project_type:datapack'], ['categories:worldgen']])
  })
  try {
    const result = await fetchJson<{ hits: ModrinthProject[] }>(`https://api.modrinth.com/v2/search?${params}`)
    return result.hits
  } catch {
    return []
  }
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_\-. ]/g, '_').trim().slice(0, 60) || 'world'
}

async function uniqueDir(parent: string, base: string): Promise<string> {
  let candidate = path.join(parent, base)
  for (let index = 2; await fs.pathExists(candidate); index++) {
    candidate = path.join(parent, `${base}-${index}`)
  }
  return candidate
}

function worldDir(profileId: string, dirName: string): string {
  const name = path.basename(dirName)
  if (name === '.' || name === '..' || !name) throw new Error(msg('Мир не найден'))
  return path.join(savesDir(profileId), name)
}

function tagValue(tag: unknown): unknown {
  if (tag && typeof tag === 'object' && 'value' in tag) return (tag as { value: unknown }).value
  return undefined
}

function numberFromTag(tag: unknown): number | undefined {
  const value = tagValue(tag)
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (Array.isArray(value) && value.length === 2) {
    // prismarine-nbt encodes TAG_Long as [high, low] signed 32-bit parts.
    return value[0] * 2 ** 32 + (value[1] >>> 0)
  }
  return undefined
}

interface WorldMeta {
  name?: string
  version?: string
  lastPlayed?: number
}

async function readLevelData(file: string): Promise<WorldMeta> {
  try {
    const { parsed } = await parse(await fs.readFile(file))
    const root = parsed.value as Record<string, unknown>
    const data = (root.Data ?? root) as Record<string, unknown>
    const version = data.Version as Record<string, unknown> | undefined
    return {
      name: typeof tagValue(data.LevelName) === 'string' ? String(tagValue(data.LevelName)) : undefined,
      version: typeof tagValue(version?.Name) === 'string' ? String(tagValue(version?.Name)) : undefined,
      lastPlayed: numberFromTag(data.LastPlayed)
    }
  } catch {
    return {}
  }
}

async function folderSize(dir: string): Promise<number> {
  let total = 0
  let entries: fs.Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += await folderSize(full)
    else if (entry.isFile()) total += (await fs.stat(full)).size
  }
  return total
}

async function worldIcon(dir: string): Promise<string | undefined> {
  const file = path.join(dir, 'icon.png')
  try {
    const stat = await fs.stat(file)
    if (stat.size > 512 * 1024) return undefined
    return `data:image/png;base64,${(await fs.readFile(file)).toString('base64')}`
  } catch {
    return undefined
  }
}

/** Lists real saves of an instance with metadata from level.dat. */
export async function listWorlds(profileId: string): Promise<WorldInfo[]> {
  const saves = savesDir(profileId)
  if (!(await fs.pathExists(saves))) return []
  const entries = await fs.readdir(saves, { withFileTypes: true })
  const result: WorldInfo[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = path.join(saves, entry.name)
    const level = path.join(dir, 'level.dat')
    if (!(await fs.pathExists(level))) continue
    const meta = await readLevelData(level)
    const stat = await fs.stat(level).catch(() => null)
    result.push({
      dirName: entry.name,
      name: meta.name ?? entry.name,
      version: meta.version ?? '',
      lastPlayed: meta.lastPlayed,
      size: await folderSize(dir),
      modifiedAt: stat?.mtimeMs ?? 0,
      iconUrl: await worldIcon(dir)
    })
  }
  return result.sort((a, b) => (b.lastPlayed ?? b.modifiedAt) - (a.lastPlayed ?? a.modifiedAt))
}

/** Imports a .zip/.mcworld file into the instance's saves folder. */
export async function importWorldFile(profileId: string): Promise<void> {
  const parent = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = {
    title: msg('Выберите архив мира'),
    filters: [
      { name: msg('Архивы миров'), extensions: ['zip', 'mcworld'] },
      { name: msg('Все файлы'), extensions: ['*'] }
    ],
    properties: ['openFile']
  }
  const chosen = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  if (chosen.canceled || !chosen.filePaths[0]) return

  await importWorldFilePath(profileId, chosen.filePaths[0])
}

/** Imports an already selected .zip/.mcworld archive into the saves folder. */
export async function importWorldFilePath(profileId: string, archivePath: string): Promise<void> {
  const temp = path.join(dirs.cache, `world-import-${uid()}`)
  await fs.ensureDir(temp)
  try {
    const zip = new AdmZip(archivePath)
    const entries = zip.getEntries()
    if (entries.some((entry) => entry.entryName.split('/').includes('..'))) {
      throw new Error(msg('Архив мира содержит небезопасные пути'))
    }
    const levelEntries = entries
      .filter((entry) => /(^|\/)level\.dat$/i.test(entry.entryName))
      .sort((a, b) => a.entryName.split('/').length - b.entryName.split('/').length)
    if (!levelEntries.length) throw new Error(msg('Файл не содержит мир Minecraft (level.dat)'))

    const prefix = path.posix.dirname(levelEntries[0].entryName)
    const folder = !prefix || prefix === '.' || prefix === '/' ? '' : prefix
    zip.extractAllTo(temp, true)
    const source = folder ? path.join(temp, folder) : temp
    if (!(await fs.pathExists(path.join(source, 'level.dat')))) {
      throw new Error(msg('Не удалось найти мир в архиве'))
    }

    const saves = savesDir(profileId)
    await fs.ensureDir(saves)
    const fallback = path.basename(archivePath).replace(/\.(zip|mcworld)$/i, '')
    const destination = await uniqueDir(saves, safeName(folder ? path.basename(folder) : fallback))
    await fs.copy(source, destination, { overwrite: true })
    emitToast('success', msg('Мир «{name}» импортирован', { name: path.basename(destination) }))
  } finally {
    await fs.remove(temp)
  }
}

/** Exports one world folder as a ZIP archive. */
export async function exportWorld(profileId: string, dirName: string): Promise<void> {
  const source = worldDir(profileId, dirName)
  if (!(await fs.pathExists(path.join(source, 'level.dat')))) throw new Error(msg('Мир не найден'))
  const parent = BrowserWindow.getFocusedWindow()
  const options: Electron.SaveDialogOptions = {
    title: msg('Экспорт мира'),
    defaultPath: `${safeName(dirName)}.zip`,
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
    buttonLabel: msg('Экспорт')
  }
  const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return
  const zip = new AdmZip()
  zip.addLocalFolder(source, safeName(dirName))
  await fs.ensureDir(path.dirname(result.filePath))
  await fs.writeFile(result.filePath, zip.toBuffer())
  emitToast('success', msg('Мир «{name}» экспортирован', { name: dirName }))
}

/** Copies a world into another instance under a free name. */
export async function copyWorld(profileId: string, dirName: string, targetProfileId: string): Promise<void> {
  const profile = getState().profiles.find((item) => item.id === targetProfileId)
  if (!profile) throw new Error(msg('Сборка не найдена'))
  const source = worldDir(profileId, dirName)
  if (!(await fs.pathExists(path.join(source, 'level.dat')))) throw new Error(msg('Мир не найден'))
  const saves = savesDir(targetProfileId)
  await fs.ensureDir(saves)
  const destination = await uniqueDir(saves, safeName(dirName))
  await fs.copy(source, destination, { overwrite: true })
  emitToast('success', msg('Мир скопирован в сборку «{name}»', { name: profile.name }))
}

/** Renames the folder and the LevelName stored in level.dat. */
export async function renameWorld(profileId: string, dirName: string, name: string): Promise<void> {
  const source = worldDir(profileId, dirName)
  const nextName = safeName(name)
  if (!nextName) throw new Error(msg('Неверное имя мира'))
  const level = path.join(source, 'level.dat')
  if (await fs.pathExists(level)) {
    try {
      const { parsed } = await parse(await fs.readFile(level))
      const root = parsed.value as Record<string, unknown>
      const data = (root.Data ?? root) as Record<string, unknown>
      const levelName = data.LevelName as { value?: string } | undefined
      if (levelName) levelName.value = nextName
      await fs.writeFile(level, zlib.gzipSync(writeUncompressed(parsed, 'big')))
    } catch {
      // A malformed level.dat must not prevent renaming the save folder.
    }
  }
  const destination = path.join(path.dirname(source), nextName)
  if (destination !== source) await fs.move(source, destination, { overwrite: false })
  emitToast('success', msg('Мир переименован'))
}

export async function deleteWorld(profileId: string, dirName: string): Promise<void> {
  const source = worldDir(profileId, dirName)
  if (!(await fs.pathExists(source))) return
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    title: msg('Удалить мир «{name}»?', { name: dirName }),
    message: msg('Мир и все его данные будут удалены безвозвратно.'),
    buttons: [msg('Отмена'), msg('Удалить')],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  }
  const parent = BrowserWindow.getFocusedWindow()
  const answer = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
  if (answer.response !== 1) return
  await fs.remove(source)
  emitToast('success', msg('Мир удалён'))
}

/** Downloads a Modrinth project and installs it into the active instance's `saves`. */
export async function installWorld(profileId: string, projectId: string): Promise<void> {
  const profile = getState().profiles.find((entry) => entry.id === profileId)
  if (!profile) throw new Error(msg("Сборка не найдена"))

  const versions = await getProjectVersions(projectId)
  const version = versions.find((entry) => !entry.version_number.toLowerCase().includes('beta')) ?? versions[0]
  const file = version?.files.find((entry) => entry.primary && /\.(zip|mcworld)$/i.test(entry.filename))
    ?? version?.files.find((entry) => /\.(zip|mcworld)$/i.test(entry.filename))
  if (!file) throw new Error(msg('У мира нет файла для установки'))

  const extension = path.extname(file.filename).toLowerCase() || '.zip'
  const archive = path.join(dirs.cache, `world-${uid()}${extension}`)
  await downloadMany(
    [{ url: file.url, dest: archive, sha1: file.hashes?.sha1, size: file.size, label: file.filename }],
    'world',
    msg('Скачивание мира'),
    1
  )

  const temp = path.join(dirs.cache, `world-extract-${uid()}`)
  await fs.ensureDir(temp)
  try {
    const zip = new AdmZip(archive)
    const entries = zip.getEntries()
    for (const entry of entries) {
      if (entry.entryName.split('/').includes('..')) throw new Error(msg('Архив мира содержит небезопасные пути'))
    }
    const levelEntries = entries
      .filter((entry) => /(^|\/)level\.dat$/i.test(entry.entryName))
      .sort((a, b) => a.entryName.split('/').length - b.entryName.split('/').length)
    if (!levelEntries.length) throw new Error(msg('Файл не содержит мир Minecraft (level.dat)'))

    // A world archive is either a bare `level.dat` at the root or a single
    // world folder containing it. Install whichever layout it uses as one save.
    const prefix = path.posix.dirname(levelEntries[0].entryName)
    const folder = !prefix || prefix === '.' || prefix === '/' ? '' : prefix
    zip.extractAllTo(temp, true)

    const source = folder ? path.join(temp, folder) : temp
    if (!(await fs.pathExists(path.join(source, 'level.dat')))) {
      throw new Error(msg('Не удалось найти мир в архиве'))
    }
    const saves = savesDir(profileId)
    await fs.ensureDir(saves)
    const fallback = file.filename.replace(/\.(zip|mcworld)$/i, '')
    const destination = await uniqueDir(saves, safeName(folder ? path.basename(folder) : fallback))
    await fs.copy(source, destination, { overwrite: true })
    emitToast('success', msg('Мир «{name}» установлен в сборку «{profile}»', {
      name: path.basename(destination),
      profile: profile.name
    }))
  } finally {
    await fs.remove(temp)
    await fs.remove(archive)
  }
}
