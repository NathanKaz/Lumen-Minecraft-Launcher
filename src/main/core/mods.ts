import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import { BrowserWindow, dialog } from 'electron'
import { msg } from './i18n'
import { emitLog, emitToast } from './events'
import { fetchJson } from './http'
import { modsDir } from './paths'
import { getState } from './store'
import { installModrinthProject } from './modrinth'
import type { ModInfo, ModIssue, ModListEntry } from '@shared/types'

const MODRINTH_API = 'https://api.modrinth.com/v2'

/** Metadata kept private: `ModInfo` stays unchanged for the renderer. */
interface ModMetadata extends Omit<ModInfo, 'fileName' | 'enabled' | 'size'> {
  id?: string
  detected?: boolean
}

interface ModEntry extends ModInfo {
  id?: string
  detected?: boolean
}

interface ModListManifest {
  format: 'lumen-modlist'
  version: number
  exportedAt: string
  profileId: string
  mods: ModListEntry[]
}

function readZipText(zip: AdmZip, name: string): string | null {
  const entry = zip.getEntry(name)
  return entry ? entry.getData().toString('utf8') : null
}

function parseMetadata(file: string, fallback: string): ModMetadata {
  const result: ModMetadata = {
    name: fallback,
    version: '',
    loader: 'unknown',
    detected: false
  }
  try {
    const zip = new AdmZip(file)
    const fabric = readZipText(zip, 'fabric.mod.json') ?? readZipText(zip, 'quilt.mod.json')
    if (fabric) {
      const json = JSON.parse(fabric) as {
        id?: string
        name?: string
        version?: string
        description?: string
        icon?: string
        quilt_loader?: { id?: string }
      }
      return {
        name: json.name ?? fallback,
        version: typeof json.version === 'string' ? json.version : '',
        description: json.description,
        icon: json.icon,
        id: json.id ?? json.quilt_loader?.id,
        loader: readZipText(zip, 'quilt.mod.json') ? 'quilt' : 'fabric',
        detected: true
      }
    }
    const forge = readZipText(zip, 'META-INF/mods.toml') ?? readZipText(zip, 'mcmod.info')
    if (forge) {
      if (forge.trim().startsWith('[')) {
        const json = (JSON.parse(forge) as Array<{
          modid?: string
          name?: string
          version?: string
          description?: string
          logoFile?: string
        }>)[0]
        if (json) {
          return {
            name: json.name ?? fallback,
            version: json.version ?? '',
            description: json.description,
            icon: json.logoFile,
            id: json.modid,
            loader: 'forge',
            detected: true
          }
        }
      }
      const id = forge.match(/^\s*modId\s*=\s*"([^"]+)"/m)?.[1]
        ?? forge.match(/^\s*modid\s*=\s*"([^"]+)"/m)?.[1]
      const name = forge.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1]
      const version = forge.match(/^\s*version\s*=\s*"([^"]+)"/m)?.[1]
      const description = forge.match(/^\s*description\s*=\s*"([^"]+)"/m)?.[1]
      return { name: name ?? fallback, version: version ?? '', description, id, loader: 'forge', detected: true }
    }
  } catch {
    // Файл может быть не модом — используем имя файла
  }
  return result
}

async function readModEntries(profileId: string): Promise<ModEntry[]> {
  const dir = modsDir(profileId)
  if (!(await fs.pathExists(dir))) return []
  const entries = await fs.readdir(dir)
  const mods: ModEntry[] = []
  for (const entry of entries) {
    if (!/\.(jar|zip)(\.disabled)?$/i.test(entry)) continue
    const enabled = !entry.endsWith('.disabled')
    const fileName = enabled ? entry : entry.slice(0, -'.disabled'.length)
    const file = path.join(dir, entry)
    const stat = await fs.stat(file).catch(() => null)
    if (!stat?.isFile()) continue
    const cleanName = fileName.replace(/\.(jar|zip)$/i, '').replace(/-\d[\d.]*.*$/, '')
    mods.push({
      fileName,
      ...parseMetadata(file, cleanName),
      enabled,
      size: stat.size
    })
  }
  return mods.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name))
}

export async function listMods(profileId: string): Promise<ModInfo[]> {
  return readModEntries(profileId)
}

/** Renames only files that actually exist, without overwriting an opposite copy. */
export async function setModsEnabled(profileId: string, fileNames: string[], enabled: boolean): Promise<void> {
  const dir = modsDir(profileId)
  for (const rawName of new Set(fileNames)) {
    const fileName = path.basename(rawName)
    if (!fileName || fileName === '.' || fileName === '..') continue
    const source = path.join(dir, enabled ? `${fileName}.disabled` : fileName)
    const target = path.join(dir, enabled ? fileName : `${fileName}.disabled`)
    if (!(await fs.pathExists(source)) || (await fs.pathExists(target))) continue
    await fs.rename(source, target)
  }
}

function sha1(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1')
    const stream = fs.createReadStream(file)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/** Best-effort lookup so exported lists can be re-imported from Modrinth. */
async function findModrinthVersion(file: string): Promise<{ projectId: string; versionId: string } | null> {
  try {
    const hash = await sha1(file)
    const version = await fetchJson<{ id?: string; project_id?: string }>(
      `${MODRINTH_API}/version_file/${hash}?algorithm=sha1`
    )
    if (!version.project_id) return null
    return { projectId: version.project_id, versionId: version.id ?? '' }
  } catch {
    return null
  }
}

export async function exportModList(profileId: string): Promise<void> {
  const mods = await readModEntries(profileId)
  const dir = modsDir(profileId)
  const entries: ModListEntry[] = []
  for (const mod of mods) {
    const file = path.join(dir, mod.enabled ? mod.fileName : `${mod.fileName}.disabled`)
    const version = (await fs.pathExists(file)) ? await findModrinthVersion(file) : null
    entries.push({
      projectId: version?.projectId ?? '',
      ...(version?.versionId ? { versionId: version.versionId } : {}),
      fileName: mod.fileName,
      name: mod.name
    })
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const options: Electron.SaveDialogOptions = {
    title: msg('Экспорт списка модов'),
    defaultPath: `mods-${stamp}.json`,
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: msg('Все файлы'), extensions: ['*'] }
    ],
    buttonLabel: msg('Экспорт')
  }
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
  const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return

  const manifest: ModListManifest = {
    format: 'lumen-modlist',
    version: 1,
    exportedAt: new Date().toISOString(),
    profileId,
    mods: entries
  }
  await fs.ensureDir(path.dirname(result.filePath))
  await fs.writeJson(result.filePath, manifest, { spaces: 2 })
  emitToast('success', msg('Список модов экспортирован: {count}', { count: entries.length }))
}

function parseModList(raw: unknown): ModListEntry[] {
  const source = Array.isArray(raw)
    ? raw
    : ((raw as { mods?: unknown } | null)?.mods ?? (raw as { entries?: unknown } | null)?.entries)
  if (!Array.isArray(source)) return []
  return source.flatMap((item): ModListEntry[] => {
    if (!item || typeof item !== 'object') return []
    const value = item as Partial<ModListEntry>
    if (typeof value.projectId !== 'string' || !value.projectId.trim()) return []
    const fileName = typeof value.fileName === 'string' ? value.fileName : ''
    return [{
      projectId: value.projectId.trim(),
      ...(typeof value.versionId === 'string' && value.versionId.trim()
        ? { versionId: value.versionId.trim() }
        : {}),
      fileName,
      name: typeof value.name === 'string' && value.name.trim() ? value.name : fileName || value.projectId
    }]
  })
}

export async function importModList(profileId: string): Promise<void> {
  const options: Electron.OpenDialogOptions = {
    title: msg('Выберите файл списка модов'),
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: msg('Все файлы'), extensions: ['*'] }
    ],
    properties: ['openFile']
  }
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  if (result.canceled || !result.filePaths[0]) return

  let raw: unknown
  try {
    raw = await fs.readJson(result.filePaths[0])
  } catch {
    emitToast('error', msg('Не удалось прочитать список модов'))
    return
  }
  const entries = parseModList(raw)
  if (!entries.length) {
    emitToast('error', msg('Список модов не содержит корректных записей'))
    return
  }

  let installed = 0
  let failed = 0
  for (const entry of entries) {
    try {
      await installModrinthProject(profileId, entry.projectId, entry.versionId)
      installed += 1
    } catch (error) {
      failed += 1
      emitLog('warn', msg('Не удалось установить мод {name}: {error}', {
        name: entry.name || entry.fileName || entry.projectId,
        error: error instanceof Error ? error.message : String(error)
      }))
    }
  }
  emitToast(failed ? 'info' : 'success', failed
    ? msg('Импортировано модов: {count}. Не удалось: {failed}', { count: installed, failed })
    : msg('Импортировано модов: {count}', { count: installed }))
}

export async function analyzeMods(profileId: string): Promise<ModIssue[]> {
  const profile = getState().profiles.find((entry) => entry.id === profileId)
  const mods = await readModEntries(profileId)
  const issues: ModIssue[] = []

  const byId = new Map<string, ModEntry[]>()
  for (const mod of mods) {
    if (!mod.id) continue
    const key = mod.id.toLowerCase()
    byId.set(key, [...(byId.get(key) ?? []), mod])
  }
  for (const group of byId.values()) {
    if (group.length < 2) continue
    for (const mod of group) {
      issues.push({
        fileName: mod.fileName,
        type: 'duplicate',
        message: msg('Обнаружена копия мода «{name}» (ID: {id}): файлов с этим ID: {count}', {
          name: mod.name,
          id: mod.id ?? '',
          count: group.length
        })
      })
    }
  }

  for (const mod of mods) {
    if (!mod.detected) {
      issues.push({
        fileName: mod.fileName,
        type: 'unknown',
        message: msg('Не удалось определить метаданные мода {fileName}', { fileName: mod.fileName })
      })
    }
    if (profile && mod.loader !== 'unknown' && mod.loader !== profile.loader) {
      issues.push({
        fileName: mod.fileName,
        type: 'loader',
        message: msg('Мод {name} рассчитан на {loader}, а сборка использует {profileLoader}', {
          name: mod.name,
          loader: mod.loader,
          profileLoader: profile.loader
        })
      })
    }
    if (!mod.enabled) {
      issues.push({
        fileName: mod.fileName,
        type: 'disabled',
        message: msg('Мод {name} отключён', { name: mod.name })
      })
    }
  }
  return issues
}

export async function toggleMod(profileId: string, fileName: string): Promise<void> {
  const dir = modsDir(profileId)
  const enabledPath = path.join(dir, fileName)
  const disabledPath = `${enabledPath}.disabled`
  if (await fs.pathExists(enabledPath)) await fs.rename(enabledPath, disabledPath)
  else if (await fs.pathExists(disabledPath)) await fs.rename(disabledPath, enabledPath)
}

export async function deleteMod(profileId: string, fileName: string): Promise<void> {
  const dir = modsDir(profileId)
  for (const candidate of [fileName, `${fileName}.disabled`]) {
    const file = path.join(dir, candidate)
    if (await fs.pathExists(file)) await fs.remove(file)
  }
}

export async function copyModFile(profileId: string, source: string): Promise<void> {
  const target = modsDir(profileId)
  await fs.ensureDir(target)
  await fs.copy(source, path.join(target, path.basename(source)), { overwrite: true })
}
