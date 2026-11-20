import { create } from 'zustand'
import { t } from './lib/i18n'
import { api } from './lib/api'
import type {
  AppState,
  GameStatus,
  LogPayload,
  ProgressPayload,
  ToastPayload,
  VersionManifest
} from '@shared/types'

export type Page = 'home' | 'screenshots' | 'skins' | 'modpacks' | 'worlds' | 'settings'

interface LauncherStore {
  state: AppState | null
  versions: VersionManifest | null
  page: Page
  openedProfileId: string | null
  progress: ProgressPayload | null
  logs: LogPayload[]
  gameStatus: GameStatus
  toasts: ToastPayload[]
  busy: boolean
  init: () => Promise<void>
  refresh: () => Promise<void>
  setPage: (page: Page) => void
  openProfile: (id: string) => Promise<void>
  backToInstances: () => void
  /** Shows the native confirmation dialog, then removes the build and all of its files. */
  removeProfile: (id: string) => Promise<boolean>
  setBusy: (busy: boolean) => void
  dismissToast: (id: string) => void
  pushToast: (type: ToastPayload['type'], message: string) => void
}

export const useLauncher = create<LauncherStore>((set, get) => ({
  state: null,
  versions: null,
  page: 'home',
  openedProfileId: null,
  progress: null,
  logs: [],
  gameStatus: 'idle',
  toasts: [],
  busy: false,

  init: async () => {
    api.onProgress((progress) => set({ progress }))
    api.onLog((log) => set({ logs: [...get().logs, log].slice(-400) }))
    api.onGameStatus((gameStatus) => set({ gameStatus }))
    api.onToast((toast) => set({ toasts: [...get().toasts, toast] }))

    const [state, versions, gameStatus, logs] = await Promise.all([
      api.getState(),
      api.getVersions().catch(() => null),
      api.getGameStatus().catch(() => 'idle' as GameStatus),
      api.getLogs().catch(() => [])
    ])
    set({ state, versions, gameStatus, logs })
  },

  refresh: async () => {
    const state = await api.getState()
    set({ state })
  },

  setPage: (page) => set({ page, openedProfileId: null }),
  openProfile: async (id) => {
    set({ openedProfileId: id })
    try {
      await api.setState({ selectedProfileId: id })
      await get().refresh()
    } catch {
      get().pushToast('error', t("Не удалось сделать сборку активной"))
    }
  },
  backToInstances: () => set({ openedProfileId: null }),
  removeProfile: async (id) => {
    const confirmed = await api.confirmDeleteProfile(id)
    if (!confirmed) return false
    await api.deleteProfile(id)
    if (get().openedProfileId === id) set({ openedProfileId: null })
    await get().refresh()
    get().pushToast('info', t("Сборка и её файлы удалены"))
    return true
  },
  setBusy: (busy) => set({ busy }),
  dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
  pushToast: (type, message) =>
    set({ toasts: [...get().toasts, { id: `${Date.now()}-${Math.random()}`, type, message }] })
}))

export function selectedProfile(state?: AppState | null) {
  if (!state) return null
  return state.profiles.find((profile) => profile.id === state.selectedProfileId) ?? state.profiles[0] ?? null
}

export function findProfile(state: AppState | null, profileId: string | null) {
  if (!state || !profileId) return null
  return state.profiles.find((profile) => profile.id === profileId) ?? null
}
