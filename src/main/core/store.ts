import path from 'node:path'
import { msg } from './i18n'
import crypto from 'node:crypto'
import fs from 'fs-extra'
import { clearDirNames, dirs, registerAccountDir, registerProfileDir, root, safeDirName } from './paths'
import type { Account, AccountRecord, AppState, BuildGroup, MicrosoftCredentials, Profile, Settings } from '@shared/types'
import { defaultProfileName } from '@shared/naming'
import { offlineUuid } from '@shared/uuid'
import { DEFAULT_HOTKEYS } from '@shared/hotkeys'

const statePath = path.join(root, 'launcher-state.json')
const currentSchemaVersion = 3

function cleanName(name: string): string {
  return name.trim().slice(0, 16) || 'Steve'
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
    name: defaultProfileName('1.20.1', 'fabric'),
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
    createdAt: record.createdAt ?? Date.now(),
    expiresAt: record.expiresAt,
    xuid: record.xuid,
    userHash: record.userHash
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
  onboardingCompleted: false,
  curseforgeApiKey: '',
  hotkeys: { ...DEFAULT_HOTKEYS },
  theme: 'dark',
  accent: 'mint',
  accessibility: { uiScale: 1, compact: false, reducedMotion: false },
  profileSort: 'default'
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
        createdAt: legacyAccount.createdAt ?? Date.now(),
        expiresAt: legacyAccount.expiresAt,
        xuid: legacyAccount.xuid,
        userHash: legacyAccount.userHash
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

/**
 * Renames instance/backup/skin folders from IDs (or old display names) to the
 * current names shown in the launcher, and keeps the ID -> folder mapping used
 * by all path helpers. Existing data is never overwritten.
 */
function moveFolder(source: string, target: string): boolean {
  if (source === target) return true
  if (!fs.existsSync(source)) return true
  if (fs.existsSync(target)) return false
  try {
    fs.renameSync(source, target)
    return true
  } catch {
    return false
  }
}

function folderExists(root: string, name: string, except?: string): boolean {
  try {
    const lower = name.toLowerCase()
    const skip = except?.toLowerCase()
    return fs.readdirSync(root).some((entry) => entry.toLowerCase() === lower && entry.toLowerCase() !== skip)
  } catch {
    return false
  }
}

function assignDirNames<T extends { id: string; name: string; dirName?: string }>(
  records: T[],
  register: (id: string, name: string) => void,
  roots: string[],
  syncDisplayName = false
): void {
  const byId = new Map<string, T[]>()
  for (const record of records) {
    const group = byId.get(record.id)
    if (group) group.push(record)
    else byId.set(record.id, [record])
  }

  const used = new Set<string>()
  const primaryRoot = roots[0]
  for (const [id, group] of byId) {
    const oldName = group[0].dirName ?? id
    const originalName = group[0].name
    const base = safeDirName(originalName)
    let candidate = base
    let index = 2
    // Only the primary root (instances/skins) decides which names are taken.
    // An old backup folder must not force the visible instance folder to -2.
    while (used.has(candidate.toLowerCase()) || folderExists(primaryRoot, candidate, oldName)) {
      const suffix = `-${index++}`
      candidate = `${base.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`
    }
    used.add(candidate.toLowerCase())

    const from = path.join(primaryRoot, oldName)
    const to = path.join(primaryRoot, candidate)
    let finalName = oldName
    if (moveFolder(from, to)) {
      finalName = candidate
      // Keep secondary roots (backups) aligned on a best-effort basis. A stale
      // backup folder is preserved rather than blocking the readable name.
      for (const root of roots.slice(1)) {
        moveFolder(path.join(root, oldName), path.join(root, candidate))
      }
    } else {
      used.delete(candidate.toLowerCase())
    }

    register(id, finalName)
    const derivedFromName = finalName === base || finalName.startsWith(`${base}-`)
    for (const record of group) {
      record.dirName = finalName
      // When a suffix is needed, show it in the UI too so the instance name
      // and its folder stay identical.
      if (syncDisplayName && derivedFromName && finalName !== originalName) record.name = finalName
    }
  }
}

function syncDirNames(): void {
  if (!state) return
  clearDirNames()
  const profiles = [
    ...state.profiles,
    ...(state.accounts ?? []).flatMap((account) => account.profiles ?? [])
  ]
  assignDirNames(profiles, registerProfileDir, [dirs.instances, dirs.backups], true)
  assignDirNames(state.accounts ?? [], registerAccountDir, [dirs.skins])
}

export function saveState(): void {
  if (!state) return
  syncDirNames()
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

export function addMicrosoftAccount(credentials: MicrosoftCredentials): AppState {
  const synced = snapshotActive(state!)
  // Re-signing in after a logout reuses the old record so its instances stay put.
  const previous = synced.accounts.find((entry) => entry.uuid === credentials.uuid)
  if (previous) {
    const updated: AccountRecord = {
      ...previous,
      name: cleanName(credentials.name),
      token: credentials.token,
      type: 'microsoft',
      expiresAt: credentials.expiresAt,
      xuid: credentials.xuid,
      userHash: credentials.userHash
    }
    state = { ...synced, accounts: synced.accounts.map((entry) => (entry.id === previous.id ? updated : entry)) }
    if (synced.activeAccountId === previous.id) state = loadAccount(state, updated)
    saveState()
    return state
  }
  const account: Account = {
    id: crypto.randomUUID(),
    name: cleanName(credentials.name),
    uuid: credentials.uuid,
    token: credentials.token,
    type: 'microsoft',
    createdAt: Date.now(),
    expiresAt: credentials.expiresAt,
    xuid: credentials.xuid,
    userHash: credentials.userHash
  }
  const profile = defaultProfile()
  const record = accountRecord(account, [profile], [], profile.id)
  state = loadAccount({ ...synced, accounts: [...synced.accounts, record] }, record)
  saveState()
  return state
}

/** Updates short-lived Microsoft credentials without touching instances or skins. */
export function updateMicrosoftAccount(
  id: string,
  patch: Pick<MicrosoftCredentials, 'name' | 'uuid' | 'token' | 'expiresAt'> &
    Partial<Pick<MicrosoftCredentials, 'xuid' | 'userHash'>>
): AppState {
  const synced = snapshotActive(state!)
  const target = synced.accounts.find((account) => account.id === id)
  if (!target || target.type !== 'microsoft') throw new Error(msg('Профиль не найден'))
  const updated: AccountRecord = {
    ...target,
    name: cleanName(patch.name),
    uuid: patch.uuid,
    token: patch.token,
    expiresAt: patch.expiresAt,
    xuid: patch.xuid ?? target.xuid,
    userHash: patch.userHash ?? target.userHash
  }
  state = { ...synced, accounts: synced.accounts.map((account) => (account.id === id ? updated : account)) }
  if (synced.activeAccountId === id) state = loadAccount(state, updated)
  saveState()
  return state
}

/** Keeps the local instances but drops the Microsoft identity after sign-out. */
export function signOutMicrosoftAccount(id: string): AppState {
  const synced = snapshotActive(state!)
  const target = synced.accounts.find((account) => account.id === id)
  if (!target || target.type !== 'microsoft') throw new Error(msg('Профиль не найден'))
  const updated: AccountRecord = {
    ...target,
    name: cleanName(target.name),
    uuid: offlineUuid(target.name),
    token: crypto.randomUUID(),
    type: 'offline',
    expiresAt: undefined,
    xuid: undefined,
    userHash: undefined
  }
  state = { ...synced, accounts: synced.accounts.map((account) => (account.id === id ? updated : account)) }
  if (synced.activeAccountId === id) state = loadAccount(state, updated)
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
  // A Microsoft profile owns its UUID and access token; renaming only affects
  // the local display name (the UI normally hides this action for such accounts).
  const updated: AccountRecord = {
    ...target,
    name: clean,
    ...(target.type === 'microsoft' ? {} : { uuid: offlineUuid(clean), token: crypto.randomUUID() })
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
