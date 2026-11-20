import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'fs-extra'
import { msg } from './i18n'
import { emitLog, emitProgress } from './events'
import { modsDir } from './paths'
import { getState } from './store'
import { fetchJson } from './http'
import { downloadMany, type DownloadTask } from './downloader'
import { createAutoBackup } from './backups'
import { listMods } from './mods'
import type { ModUpdateInfo, UpdateAllResult } from '@shared/types'

const API = 'https://api.modrinth.com/v2'

interface ModrinthFile {
  hashes: { sha1: string; sha512: string }
  url: string
  primary: boolean
  filename: string
  size: number
}

interface ModrinthVersion {
  id: string
  project_id: string
  version_number: string
  name: string
  game_versions: string[]
  loaders: string[]
  files: ModrinthFile[]
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

async function lookupMod(hash: string): Promise<ModrinthVersion | null> {
  try {
    return await fetchJson<ModrinthVersion>(`${API}/version_file/${hash}?algorithm=sha1`)
  } catch {
    return null
  }
}

async function projectVersions(projectId: string, gameVersion: string, loader: string): Promise<ModrinthVersion[]> {
  const params = new URLSearchParams({
    game_versions: JSON.stringify([gameVersion]),
    loaders: JSON.stringify([loader])
  })
  const exact = await fetchJson<ModrinthVersion[]>(`${API}/project/${encodeURIComponent(projectId)}/version?${params}`)
  if (exact.length) return exact
  return fetchJson<ModrinthVersion[]>(`${API}/project/${encodeURIComponent(projectId)}/version`)
}

export async function checkModUpdates(profileId: string): Promise<ModUpdateInfo[]> {
  const profile = getState().profiles.find((entry) => entry.id === profileId)
  if (!profile) throw new Error(msg('Сборка не найдена'))
  const mods = await listMods(profileId)
  const result: ModUpdateInfo[] = []

  for (const mod of mods) {
    const candidates = [`${mod.fileName}.disabled`, mod.fileName]
    let source: string | null = null
    let hash = ''
    for (const candidate of candidates) {
      const file = path.join(modsDir(profileId), candidate)
      if (await fs.pathExists(file)) {
        source = file
        hash = await sha1(file)
        break
      }
    }
    if (!source) continue

    const current = await lookupMod(hash)
    if (!current) continue
    const versions = await projectVersions(current.project_id, profile.versionId, profile.loader)
    if (!versions.length) continue
    const latest = versions[0]
    if (latest.id === current.id) continue

    result.push({
      fileName: mod.fileName,
      name: mod.name,
      currentVersion: current.version_number,
      latestVersion: latest.version_number,
      projectId: current.project_id
    })
  }
  return result
}

/** Shared download step for single and bulk mod updates (no backup/progress here). */
async function downloadModVersion(profileId: string, fileName: string, projectId: string): Promise<void> {
  const profile = getState().profiles.find((entry) => entry.id === profileId)
  if (!profile) throw new Error(msg('Сборка не найдена'))

  const versions = await projectVersions(projectId, profile.versionId, profile.loader)
  const version = versions[0]
  if (!version) throw new Error(msg('Для проекта {id} нет доступных версий', { id: projectId }))
  const file = version.files.find((entry) => entry.primary) ?? version.files[0]
  if (!file) throw new Error(msg('Для проекта {id} нет доступных версий', { id: version.project_id }))

  const dir = modsDir(profileId)
  await fs.ensureDir(dir)
  await fs.remove(path.join(dir, fileName))
  await fs.remove(path.join(dir, `${fileName}.disabled`))
  const task: DownloadTask = {
    url: file.url,
    dest: path.join(dir, file.filename),
    sha1: file.hashes.sha1,
    size: file.size,
    label: file.filename
  }
  await downloadMany([task], 'mod', msg('Мод {name}', { name: version.name }), 2)
}

export async function updateMod(profileId: string, fileName: string, projectId: string): Promise<void> {
  await createAutoBackup(profileId, msg('Автобэкап перед обновлением модов'))
  await downloadModVersion(profileId, fileName, projectId)
}

function batchProgress(message: string, current: number, total: number): void {
  emitProgress({
    phase: 'mod',
    message,
    percent: total ? Math.round((current / total) * 100) : 100,
    current,
    total,
    bytes: 0,
    totalBytes: 0,
    speed: 0
  })
}

export async function updateAllMods(profileId: string): Promise<UpdateAllResult> {
  const updates = await checkModUpdates(profileId)
  const result: UpdateAllResult = { updated: [], failed: [] }
  if (!updates.length) return result

  try {
    await createAutoBackup(profileId, msg('Автобэкап перед обновлением модов'))
  } catch (error) {
    emitLog('warn', msg('Не удалось создать автобэкап: {error}', {
      error: error instanceof Error ? error.message : String(error)
    }))
  }

  const total = updates.length
  batchProgress(msg('Обновление модов: {current}/{total}', { current: 0, total }), 0, total)
  for (let index = 0; index < total; index++) {
    const update = updates[index]
    batchProgress(msg('Обновление мода {name}', { name: update.name }), index, total)
    try {
      await downloadModVersion(profileId, update.fileName, update.projectId)
      result.updated.push(update.fileName)
    } catch (error) {
      result.failed.push(update.fileName)
      emitLog('warn', msg('Не удалось обновить мод {name}: {error}', {
        name: update.name,
        error: error instanceof Error ? error.message : String(error)
      }))
    }
    batchProgress(msg('Обновление модов: {current}/{total}', { current: index + 1, total }), index + 1, total)
  }
  emitLog('info', msg('Обновлено модов: {updated}, не удалось: {failed}', {
    updated: result.updated.length,
    failed: result.failed.length
  }))
  return result
}
