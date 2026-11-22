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
import type { WorldInfo, WorldProject } from '@shared/types'

const CF_API = 'https://api.curseforge.com/v1'
const CF_MINECRAFT_GAME_ID = 432
/** CurseForge class for ready-made Minecraft worlds. */
const CF_WORLDS_CLASS_ID = 17
const WORLD_PAGE_SIZE = 18

interface CfCategory {
  id: number
  name: string
}

interface CfFile {
  id: number
  fileName: string
  releaseType: number
  gameVersions?: string[]
  fileLength?: number
  downloadUrl?: string
  hashes?: Array<{ algo: number; value: string }>
}

interface CfMod {
  id: number
  name: string
  slug: string
  summary: string
  thumbnailUrl?: string
  logo?: { thumbnailUrl?: string }
  links?: { websiteUrl?: string }
  downloadCount?: number
  categories?: CfCategory[]
  mainFileId?: number
  latestFiles?: CfFile[]
}

interface CfListResponse<T> {
  data: T[]
}

function curseforgeKey(): string {
  const key = getState()?.settings.curseforgeApiKey?.trim()
  if (!key) throw new Error(msg('Укажите ключ API CurseForge в настройках лаунчера.'))
  return key
}

async function cfFetch<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${CF_API}${endpoint}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
  return fetchJson<T>(url.toString(), 30000, { 'x-api-key': curseforgeKey() })
}

/** Real worlds live on CurseForge: Modrinth has no `world` project type. */
export async function searchWorlds(query: string, offset = 0): Promise<WorldProject[]> {
  const result = await cfFetch<CfListResponse<CfMod>>('/mods/search', {
    gameId: CF_MINECRAFT_GAME_ID,
    classId: CF_WORLDS_CLASS_ID,
    searchFilter: query,
    sortField: 2,
    sortOrder: 'desc',
    pageSize: WORLD_PAGE_SIZE,
    index: Math.max(0, offset)
  })
  return result.data.map((mod) => {
    const versions = [...new Set(mod.latestFiles?.flatMap((file) => file.gameVersions ?? []) ?? [])].slice(0, 4)
    return {
      project_id: String(mod.id),
      slug: mod.slug,
      title: mod.name,
      description: mod.summary,
      icon_url: mod.thumbnailUrl ?? mod.logo?.thumbnailUrl ?? null,
      downloads: mod.downloadCount ?? 0,
      categories: mod.categories?.map((category) => category.name) ?? [],
      project_type: 'world',
      versions,
      source: 'curseforge',
      websiteUrl: mod.links?.websiteUrl,
      fileId: mod.mainFileId
    }
  })
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

/** Validates and copies a downloaded world archive into the instance's `saves`. */
async function installWorldArchive(profileId: string, archive: string, fallbackName: string): Promise<void> {
  const profile = getState().profiles.find((entry) => entry.id === profileId)
  if (!profile) throw new Error(msg("Сборка не найдена"))

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
    const destination = await uniqueDir(saves, safeName(folder ? path.basename(folder) : fallbackName))
    await fs.copy(source, destination, { overwrite: true })
    emitToast('success', msg('Мир «{name}» установлен в сборку «{profile}»', {
      name: path.basename(destination),
      profile: profile.name
    }))
  } finally {
    await fs.remove(temp)
  }
}

async function installCurseWorld(
  profileId: string,
  modId: string,
  opts?: { signal?: AbortSignal; taskId?: string },
  gameVersion?: string
): Promise<void> {
  const listing = await cfFetch<CfListResponse<CfFile>>(`/mods/${encodeURIComponent(modId)}/files`, { pageSize: 50 })
  const candidates = listing.data.filter((file) => /\.(zip|mcworld)$/i.test(file.fileName))
  const file = candidates.find((entry) => gameVersion && entry.gameVersions?.includes(gameVersion)) ?? candidates[0]
  if (!file) throw new Error(msg('У мира нет файла для установки'))

  let url = file.downloadUrl
  if (!url) {
    const response = await cfFetch<{ data: string }>(`/mods/${encodeURIComponent(modId)}/files/${file.id}/download-url`)
    url = response.data
  }
  const extension = path.extname(file.fileName).toLowerCase() || '.zip'
  const archive = path.join(dirs.cache, `world-${uid()}${extension}`)
  await downloadMany(
    [{
      url,
      dest: archive,
      sha1: file.hashes?.find((hash) => hash.algo === 1)?.value,
      size: file.fileLength,
      label: file.fileName
    }],
    'world',
    msg('Скачивание мира'),
    1,
    opts
  )
  try {
    await installWorldArchive(profileId, archive, path.basename(file.fileName).replace(/\.(zip|mcworld)$/i, ''))
  } finally {
    await fs.remove(archive)
  }
}

/** Downloads a world project (CurseForge numeric id or Modrinth id) into `saves`. */
export async function installWorld(
  profileId: string,
  projectId: string,
  opts?: { signal?: AbortSignal; taskId?: string },
  gameVersion?: string
): Promise<void> {
  if (/^\d+$/.test(projectId)) {
    await installCurseWorld(profileId, projectId, opts, gameVersion)
    return
  }

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
    1,
    opts
  )
  try {
    await installWorldArchive(profileId, archive, file.filename.replace(/\.(zip|mcworld)$/i, ''))
  } finally {
    await fs.remove(archive)
  }
}
