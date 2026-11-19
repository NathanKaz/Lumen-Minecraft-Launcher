import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import { BrowserWindow, dialog } from 'electron'
import { msg } from './i18n'
import { instanceDir } from './paths'
import { getState, setState } from './store'
import { emitProgress, uid } from './events'
import type { BuildGroup, LoaderType, Profile } from '@shared/types'

interface TransferManifest {
  format: 'lumen-instances'
  version: number
  exportedAt: string
  profiles: Profile[]
  groups: BuildGroup[]
}

const LOADERS: LoaderType[] = ['vanilla', 'fabric', 'forge', 'neoforge']
const safeId = (value: unknown): boolean => typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value)

function newId(): string {
  return crypto.randomUUID() || `${Date.now().toString(36)}-${uid()}`
}

function progress(message: string, percent: number): void {
  emitProgress({
    phase: 'modpack',
    message,
    percent,
    current: percent,
    total: 100,
    bytes: 0,
    totalBytes: 0,
    speed: 0
  })
}

export async function exportProfiles(profileIds: string[]): Promise<string | null> {
  const state = getState()
  const profiles = state.profiles.filter((profile) => profileIds.includes(profile.id))
  if (profiles.length === 0) return null

  const parent = BrowserWindow.getFocusedWindow()
  const stamp = new Date().toISOString().slice(0, 10)
  const options: Electron.SaveDialogOptions = {
    title: msg('Экспорт сборок'),
    defaultPath: `lumen-instances-${stamp}.zip`,
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
    buttonLabel: msg('Экспорт')
  }
  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null

  progress(msg('Экспорт сборок...'), 10)
  const manifest: TransferManifest = {
    format: 'lumen-instances',
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles,
    groups: state.groups.filter((group) => profiles.some((profile) => profile.groupId === group.id))
  }
  const zip = new AdmZip()
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'))
  for (const profile of profiles) {
    const dir = instanceDir(profile.id)
    if (await fs.pathExists(dir)) zip.addLocalFolder(dir, `instances/${profile.id}`)
  }
  progress(msg('Экспорт сборок...'), 80)
  await fs.ensureDir(path.dirname(result.filePath))
  await fs.writeFile(result.filePath, zip.toBuffer())
  progress(msg('Экспорт сборок...'), 100)
  return result.filePath
}

function sanitizeProfile(value: Partial<Profile>, id: string, groupId?: string): Profile {
  const memory = Number(value.memory)
  const lastPlayed = Number(value.lastPlayed)
  const playtime = Number(value.playtimeMinutes)
  const modpack = value.modpack
  return {
    id,
    name: String(value.name ?? 'Imported').slice(0, 80),
    versionId: String(value.versionId ?? '1.20.1').slice(0, 64),
    loader: LOADERS.includes(value.loader as LoaderType) ? (value.loader as LoaderType) : 'vanilla',
    loaderVersionId: typeof value.loaderVersionId === 'string' ? value.loaderVersionId : undefined,
    memory: Number.isFinite(memory) && memory >= 512 ? memory : undefined,
    groupId,
    javaPath: typeof value.javaPath === 'string' ? value.javaPath : undefined,
    jvmArgs: typeof value.jvmArgs === 'string' ? value.jvmArgs : undefined,
    createdAt: Number.isFinite(Number(value.createdAt)) ? Number(value.createdAt) : Date.now(),
    lastPlayed: Number.isFinite(lastPlayed) ? lastPlayed : undefined,
    playtimeMinutes: Number.isFinite(playtime) && playtime >= 0 ? playtime : 0,
    modpack: modpack && typeof modpack.name === 'string'
      ? {
          name: modpack.name,
          version: String(modpack.version ?? ''),
          icon: typeof modpack.icon === 'string' ? modpack.icon : undefined,
          source: modpack.source === 'mrpack' || modpack.source === 'manual' ? modpack.source : 'manual'
        }
      : undefined
  }
}

export async function importProfiles(): Promise<number> {
  const parent = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = {
    title: msg('Импорт сборок'),
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
    properties: ['openFile']
  }
  const chosen = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  if (chosen.canceled || chosen.filePaths.length === 0) return 0

  let zip: AdmZip
  try {
    zip = new AdmZip(chosen.filePaths[0])
  } catch {
    throw new Error(msg('Не удалось прочитать архив сборок'))
  }
  const manifestEntry = zip.getEntry('manifest.json')
  if (!manifestEntry) throw new Error(msg('Архив не содержит сборок'))

  let manifest: Partial<TransferManifest>
  try {
    manifest = JSON.parse(zip.readAsText('manifest.json')) as Partial<TransferManifest>
  } catch {
    throw new Error(msg('Не удалось прочитать архив сборок'))
  }
  if (!Array.isArray(manifest.profiles) || manifest.profiles.length === 0) {
    throw new Error(msg('Архив не содержит сборок'))
  }

  progress(msg('Импорт сборок...'), 10)
  const state = getState()
  const usedIds = new Set(state.profiles.map((profile) => profile.id))
  const groupMap = new Map<string, string>()
  const groups = [...state.groups]
  const usedGroupIds = new Set(state.groups.map((group) => group.id))

  for (const raw of Array.isArray(manifest.groups) ? manifest.groups : []) {
    if (!raw || !safeId(raw.id)) continue
    let groupId = raw.id
    if (usedGroupIds.has(groupId)) {
      groupId = `${raw.id}-${uid().slice(0, 6)}`
      groupMap.set(raw.id, groupId)
    }
    usedGroupIds.add(groupId)
    groups.push({
      id: groupId,
      name: String(raw.name ?? groupId).slice(0, 80),
      color: typeof raw.color === 'string' ? raw.color : undefined
    })
  }

  const profiles: Profile[] = []
  for (const raw of manifest.profiles) {
    if (!raw || typeof raw !== 'object') continue
    const oldId = typeof raw.id === 'string' ? raw.id : ''
    let id = safeId(oldId) && !usedIds.has(oldId) ? oldId : newId()
    usedIds.add(id)
    const rawGroupId = typeof raw.groupId === 'string' ? raw.groupId : undefined
    const groupId = rawGroupId ? (groupMap.get(rawGroupId) ?? (usedGroupIds.has(rawGroupId) ? rawGroupId : undefined)) : undefined
    profiles.push(sanitizeProfile(raw, id, groupId))

    const prefix = `instances/${oldId}/`
    for (const entry of zip.getEntries()) {
      const name = entry.entryName
      if (!name.startsWith(prefix) || entry.isDirectory) continue
      const relative = name.slice(prefix.length)
      if (!relative || relative.includes('..') || path.isAbsolute(relative)) continue
      const data = zip.readFile(entry)
      if (!data) continue
      const target = path.join(instanceDir(id), relative)
      await fs.ensureDir(path.dirname(target))
      await fs.writeFile(target, data)
    }
  }

  if (profiles.length === 0) throw new Error(msg('Архив не содержит сборок'))
  setState({
    profiles: [...state.profiles, ...profiles],
    groups,
    selectedProfileId: profiles[profiles.length - 1].id
  })
  progress(msg('Импорт сборок...'), 100)
  return profiles.length
}
