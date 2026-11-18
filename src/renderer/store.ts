import { create } from 'zustand'
import { api } from './lib/api'
import type {
  AppState,
  GameStatus,
  LogPayload,
  ProgressPayload,
  ToastPayload,
  VersionManifest
} from '@shared/types'

export type Page = 'home' | 'instances' | 'mods' | 'modpacks' | 'settings'

interface LauncherStore {
  state: AppState | null
  versions: VersionManifest | null
  page: Page
  progress: ProgressPayload | null
  logs: LogPayload[]
  gameStatus: GameStatus
  toasts: ToastPayload[]
  busy: boolean
  init: () => Promise<void>
  refresh: () => Promise<void>
  setPage: (page: Page) => void
  setBusy: (busy: boolean) => void
  dismissToast: (id: string) => void
  pushToast: (type: ToastPayload['type'], message: string) => void
}

export const useLauncher = create<LauncherStore>((set, get) => ({
  state: null,
  versions: null,
  page: 'home',
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

  setPage: (page) => set({ page }),
  setBusy: (busy) => set({ busy }),
  dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
  pushToast: (type, message) =>
    set({ toasts: [...get().toasts, { id: `${Date.now()}-${Math.random()}`, type, message }] })
}))

export function selectedProfile(state?: AppState | null) {
  if (!state) return null
  return state.profiles.find((profile) => profile.id === state.selectedProfileId) ?? state.profiles[0] ?? null
}
