import path from 'node:path'
import { msg } from './i18n'
import crypto from 'node:crypto'
import fs from 'fs-extra'
import { dirs, root } from './paths'
import type { Account, AccountRecord, AppState, BuildGroup, Profile, Settings } from '@shared/types'

const statePath = path.join(root, 'launcher-state.json')
const currentSchemaVersion = 3

function cleanName(name: string): string {
  return name.trim().slice(0, 16) || 'Steve'
}

function offlineUuid(name: string): string {
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest('hex')
  const hex = `${hash.slice(0, 12)}${'3'}${hash.slice(13, 16)}${'8'}${hash.slice(17, 20)}${hash.slice(20, 32)}`
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function makeAccount(name: string): Account {
  const clean = cleanName(name)
  return {
    id: crypto.randomUUID(),
    name: clean,
    uuid: offlineUuid(clean),
    token: crypto.randomUUID(),
    type: 'offline',
    createdAt: Date.now()
  }
}

function defaultProfile(): Profile {
  return {
    id: crypto.randomUUID(),
    name: msg("Мой Minecraft"),
    versionId: '1.20.1',
    loader: 'fabric',
    createdAt: Date.now(),
    playtimeMinutes: 0
  }
}

function accountRecord(
  account: Account,
  profiles: Profile[],
  groups: BuildGroup[],
  selectedProfileId: string,
  activeSkinId?: string
): AccountRecord {
  return {
    ...account,
    profiles: profiles.map((profile) => ({ ...profile })),
    groups: groups.map((group) => ({ ...group })),
    selectedProfileId: selectedProfileId || profiles[0]?.id || '',
    activeSkinId
  }
}

function toAccount(record: AccountRecord): Account {
  return {
    id: record.id,
    name: record.name,
    uuid: record.uuid,
    token: record.token,
    type: record.type,
    createdAt: record.createdAt ?? Date.now()
  }
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
  instancesView: 'grid',
  autoBackupBeforeUpdates: true,
  autoInstallJava: true,
  onboardingCompleted: false
}

const defaultGroups: BuildGroup[] = []

function defaultState(): AppState {
  const account = makeAccount('Steve')
  const profile = defaultProfile()
  return {
    schemaVersion: currentSchemaVersion,
    profiles: [profile],
    groups: [...defaultGroups],
    selectedProfileId: profile.id,
    settings: { ...defaultSettings },
    account,
    accounts: [accountRecord(account, [profile], [], profile.id)],
    activeAccountId: account.id,
    installedVersions: []
  }
}

let state: AppState | null = null

export function getState(): AppState {
  return state!
}

/** Copies the active world back into its account record before persisting. */
function snapshotActive(current: AppState): AppState {
  const activeId = current.activeAccountId || current.account.id || crypto.randomUUID()
  const snapshot = accountRecord(
    { ...current.account, id: activeId },
    current.profiles,
    current.groups,
    current.selectedProfileId,
    current.settings.activeSkinId
  )
  const source = current.accounts?.length ? current.accounts : [snapshot]
  const accounts = source.map((account) => (account.id === activeId ? { ...account, ...snapshot } : account))
  return {
    ...current,
    accounts,
    activeAccountId: activeId,
    account: toAccount({ ...snapshot, id: activeId })
  }
}

/** Loads one account record into the top-level fields used by all consumers. */
function loadAccount(current: AppState, record: AccountRecord): AppState {
  return {
    ...current,
    account: toAccount(record),
    activeAccountId: record.id,
    profiles: record.profiles.map((profile) => ({ ...profile })),
    groups: record.groups.map((group) => ({ ...group })),
    selectedProfileId: record.selectedProfileId || record.profiles[0]?.id || '',
    settings: { ...current.settings, activeSkinId: record.activeSkinId }
  }
}

export function initStore(): AppState {
  fs.ensureDirSync(dirs.root)
  const fallback = defaultState()
  if (fs.existsSync(statePath)) {
    try {
      const saved = fs.readJsonSync(statePath) as Partial<AppState>
      const legacy = (saved.schemaVersion ?? 1) < 3
      const profiles = (saved.profiles?.length ? saved.profiles : fallback.profiles).map((profile) => {
        const { memory: _legacyMemory, ...rest } = profile as Profile & { memory?: number }
        return rest
      })
      const groups = saved.groups ?? fallback.groups
      const legacyAccount = saved.account ?? fallback.account
      const baseAccount: Account = {
        id: legacyAccount.id || crypto.randomUUID(),
        name: legacyAccount.name || 'Steve',
        uuid: legacyAccount.uuid || offlineUuid(legacyAccount.name || 'Steve'),
        token: legacyAccount.token || crypto.randomUUID(),
        type: legacyAccount.type ?? 'offline',
        createdAt: legacyAccount.createdAt ?? Date.now()
      }
      const accounts: AccountRecord[] = saved.accounts?.length
        ? saved.accounts.map((account) => ({
            ...account,
            id: account.id || crypto.randomUUID(),
            createdAt: account.createdAt ?? Date.now(),
            profiles: account.profiles ?? [],
            groups: account.groups ?? [],
            selectedProfileId: account.selectedProfileId ?? ''
          }))
        : [accountRecord(baseAccount, profiles, groups, saved.selectedProfileId ?? profiles[0]?.id ?? '', saved.settings?.activeSkinId)]
      const activeAccountId = accounts.some((account) => account.id === saved.activeAccountId)
        ? saved.activeAccountId!
        : accounts[0].id
      const loaded: AppState = {
        ...fallback,
        ...saved,
        schemaVersion: currentSchemaVersion,
        settings: { ...defaultSettings, ...(saved.settings ?? {}) },
        installedVersions: saved.installedVersions ?? fallback.installedVersions,
        accounts,
        activeAccountId,
        profiles: [],
        groups: [],
        selectedProfileId: '',
        account: toAccount(accounts[0])
      }
      const active = accounts.find((account) => account.id === activeAccountId) ?? accounts[0]
      state = snapshotActive(loadAccount(loaded, active))
      // A legacy migration intentionally moves the old world into its account.
      if (legacy && !saved.accounts?.length) {
        state = {
          ...state!,
          accounts: state!.accounts.map((account) =>
            account.id === active.id
              ? { ...account, profiles, groups, selectedProfileId: saved.selectedProfileId ?? profiles[0]?.id ?? '' }
              : account
          )
        }
        state = loadAccount(state!, state!.accounts.find((account) => account.id === active.id)!)
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
  state = snapshotActive(state)
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

export function addAccount(name: string): AppState {
  const synced = snapshotActive(state!)
  const account = makeAccount(name)
  const profile = defaultProfile()
  const record = accountRecord(account, [profile], [], profile.id)
  state = loadAccount({ ...synced, accounts: [...synced.accounts, record] }, record)
  saveState()
  return state
}

export function selectAccount(id: string): AppState {
  const synced = snapshotActive(state!)
  const target = synced.accounts.find((account) => account.id === id)
  if (!target) throw new Error(msg('Профиль не найден'))
  state = loadAccount(synced, target)
  saveState()
  return state
}

export function renameAccount(id: string, name: string): AppState {
  const synced = snapshotActive(state!)
  const target = synced.accounts.find((account) => account.id === id)
  if (!target) throw new Error(msg('Профиль не найден'))
  const clean = cleanName(name)
  const updated: AccountRecord = {
    ...target,
    name: clean,
    uuid: offlineUuid(clean),
    token: crypto.randomUUID()
  }
  state = { ...synced, accounts: synced.accounts.map((account) => (account.id === id ? updated : account)) }
  if (synced.activeAccountId === id) state = loadAccount(state, updated)
  saveState()
  return state
}

export function deleteAccount(id: string): AppState {
  const synced = snapshotActive(state!)
  if (synced.accounts.length <= 1) throw new Error(msg('Последний профиль нельзя удалить.'))
  const accounts = synced.accounts.filter((account) => account.id !== id)
  if (accounts.length === synced.accounts.length) throw new Error(msg('Профиль не найден'))
  if (synced.activeAccountId === id) {
    state = loadAccount({ ...synced, accounts }, accounts[0])
  } else {
    state = { ...synced, accounts }
  }
  saveState()
  return state
}

export function setAccountName(name: string): AppState {
  return renameAccount(state!.activeAccountId, name)
}

export function markInstalled(versionId: string): AppState {
  if (!state!.installedVersions.includes(versionId)) {
    state = { ...state!, installedVersions: [...state!.installedVersions, versionId] }
    saveState()
  }
  return state!
}
