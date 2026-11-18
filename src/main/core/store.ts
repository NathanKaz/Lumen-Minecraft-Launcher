import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'fs-extra'
import { dirs, root } from './paths'
import type { Account, AppState, BuildGroup, Profile, Settings } from '@shared/types'

const statePath = path.join(root, 'launcher-state.json')
const currentSchemaVersion = 2

function offlineUuid(name: string): string {
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest('hex')
  const hex = `${hash.slice(0, 12)}${'3'}${hash.slice(13, 16)}${'8'}${hash.slice(17, 20)}${hash.slice(20, 32)}`
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const defaultSettings: Settings = {
  javaPath: '',
  memory: 2048,
  width: 1280,
  height: 720,
  fullscreen: false,
  language: 'ru',
  closeBehavior: 'exit',
  checkUpdates: true,
  instancesView: 'grid'
}

const defaultGroups: BuildGroup[] = []

function defaultState(): AppState {
  const playerName = 'Steve'
  const profile: Profile = {
    id: 'default',
    name: 'Мой Minecraft',
    versionId: '1.20.1',
    loader: 'fabric',
    createdAt: Date.now(),
    playtimeMinutes: 0
  }
  return {
    schemaVersion: currentSchemaVersion,
    profiles: [profile],
    groups: [...defaultGroups],
    selectedProfileId: profile.id,
    settings: { ...defaultSettings },
    account: {
      name: playerName,
      uuid: offlineUuid(playerName),
      token: crypto.randomUUID(),
      type: 'offline'
    },
    installedVersions: []
  }
}

let state: AppState | null = null

export function getState(): AppState {
  return state!
}

export function initStore(): AppState {
  fs.ensureDirSync(dirs.root)
  const fallback = defaultState()
  if (fs.existsSync(statePath)) {
    try {
      const saved = fs.readJsonSync(statePath) as Partial<AppState>
      const needsMigration = (saved.schemaVersion ?? 1) < currentSchemaVersion
      const profiles = (saved.profiles?.length ? saved.profiles : fallback.profiles).map((profile) => {
        if (!needsMigration) return profile
        const { memory: _legacyMemory, ...rest } = profile
        return rest
      })
      state = {
        ...fallback,
        ...saved,
        schemaVersion: currentSchemaVersion,
        groups: saved.groups ?? fallback.groups,
        settings: { ...defaultSettings, ...(saved.settings ?? {}) },
        profiles,
        account: saved.account ?? fallback.account
      }
    } catch {
      state = fallback
    }
  } else {
    state = fallback
  }
  saveState()
  return state!
}

export function saveState(): void {
  if (!state) return
  const temp = `${statePath}.tmp`
  fs.writeJsonSync(temp, state, { spaces: 2 })
  fs.renameSync(temp, statePath)
}

export function setState(patch: Partial<AppState>): AppState {
  state = { ...state!, ...patch }
  saveState()
  return state
}

export function createProfile(profile: Profile): AppState {
  state = {
    ...state!,
    profiles: [...state!.profiles, profile],
    selectedProfileId: profile.id
  }
  saveState()
  return state
}

export function updateProfile(id: string, patch: Partial<Profile>): AppState {
  state = {
    ...state!,
    profiles: state!.profiles.map((profile) => (profile.id === id ? { ...profile, ...patch } : profile))
  }
  saveState()
  return state
}

export function deleteProfile(id: string): AppState {
  const profiles = state!.profiles.filter((profile) => profile.id !== id)
  const selectedProfileId =
    state!.selectedProfileId === id ? (profiles[0]?.id ?? '') : state!.selectedProfileId
  state = { ...state!, profiles, selectedProfileId }
  saveState()
  return state
}

export function setAccountName(name: string): AppState {
  const clean = name.trim().slice(0, 16) || 'Steve'
  state = {
    ...state!,
    account: { name: clean, uuid: offlineUuid(clean), token: crypto.randomUUID(), type: 'offline' }
  }
  saveState()
  return state!
}

export function markInstalled(versionId: string): AppState {
  if (!state!.installedVersions.includes(versionId)) {
    state = { ...state!, installedVersions: [...state!.installedVersions, versionId] }
    saveState()
  }
  return state!
}
