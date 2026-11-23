import { create } from 'zustand'
import { t } from './lib/i18n'
import { api } from './lib/api'
import type {
  AppState,
  GameStatus,
  LogPayload,
  ProgressPayload,
  TaskInfo,
  ToastPayload,
  VersionManifest
} from '@shared/types'

export type Page = 'home' | 'library' | 'screenshots' | 'skins' | 'modpacks' | 'shaders' | 'logs' | 'tasks' | 'settings'

/** Sections of the dedicated instance page shown in its own sidebar. */
export type ProfileSection = 'overview' | 'mods' | 'shaders' | 'worlds' | 'screenshots' | 'tools' | 'settings'

export interface NotificationRecord extends ToastPayload {
  time: number
  read: boolean
}

const NOTIFICATIONS_KEY = 'lumen-notifications'
const NOTIFICATION_LIMIT = 100

/** Auto-hide a progress payload that reports completion but has no owner to clear it. */
let progressHideTimer: ReturnType<typeof setTimeout> | null = null
/** React StrictMode calls effects twice in dev; subscriptions must stay single. */
let subscriptionsReady = false

function clearProgressHideTimer(): void {
  if (progressHideTimer) clearTimeout(progressHideTimer)
  progressHideTimer = null
}

function loadNotifications(): NotificationRecord[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as NotificationRecord[]).slice(-NOTIFICATION_LIMIT) : []
  } catch {
    return []
  }
}

function saveNotifications(items: NotificationRecord[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(items.slice(-NOTIFICATION_LIMIT)))
  } catch {
    // Storage may be unavailable in private mode; notifications still work in memory.
  }
}

export function unreadCount(items: NotificationRecord[]): number {
  return items.filter((item) => !item.read).length
}

interface LauncherStore {
  state: AppState | null
  versions: VersionManifest | null
  page: Page
  openedProfileId: string | null
  profileSection: ProfileSection
  progress: ProgressPayload | null
  tasks: TaskInfo[]
  logs: LogPayload[]
  gameStatus: GameStatus
  toasts: ToastPayload[]
  notifications: NotificationRecord[]
  crashProfileId: string | null
  globalSearchOpen: boolean
  shortcutsOpen: boolean
  busy: boolean
  init: () => Promise<void>
  refresh: () => Promise<void>
  setPage: (page: Page) => void
  openProfile: (id: string) => Promise<void>
  backToInstances: () => void
  setProfileSection: (section: ProfileSection) => void
  /** Shows the native confirmation dialog, then removes the build and all of its files. */
  removeProfile: (id: string) => Promise<boolean>
  setBusy: (busy: boolean) => void
  setGameStatus: (status: GameStatus) => void
  /** Hides the popup only (used by the auto-dismiss timer). */
  dismissToast: (id: string) => void
  /** Hides the popup and removes its saved notification (used by the X button). */
  closeToast: (id: string) => void
  pushToast: (type: ToastPayload['type'], message: string) => void
  recordNotification: (type: ToastPayload['type'], message: string, id?: string) => void
  markNotificationsRead: () => void
  clearNotifications: () => void
  setCrashProfileId: (id: string | null) => void
  setGlobalSearchOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void
  cancelTask: (id: string) => Promise<void>
  pauseTask: (id: string) => Promise<void>
  resumeTask: (id: string) => Promise<void>
  clearFinishedTasks: () => Promise<void>
}

export const useLauncher = create<LauncherStore>((set, get) => ({
  state: null,
  versions: null,
  page: 'home',
  openedProfileId: null,
  profileSection: 'overview',
  progress: null,
  tasks: [],
  logs: [],
  gameStatus: 'idle',
  toasts: [],
  notifications: [],
  crashProfileId: null,
  globalSearchOpen: false,
  shortcutsOpen: false,
  busy: false,

  init: async () => {
    if (!subscriptionsReady) {
      subscriptionsReady = true
      api.onProgress((progress) => {
        clearProgressHideTimer()
        set({ progress })
        if (progress.percent >= 100) {
          // Some emitters only report 100% and never send a completion event.
          progressHideTimer = setTimeout(() => {
            if ((get().progress?.percent ?? 0) >= 100) set({ progress: null })
            progressHideTimer = null
          }, 900)
        }
      })
      api.onProgressDone(() => {
        clearProgressHideTimer()
        set({ progress: null })
      })
      api.onLog((log) => set({ logs: [...get().logs, log].slice(-400) }))
      api.onGameStatus((status) => get().setGameStatus(status))
      api.onToast((toast) => {
        set({ toasts: [...get().toasts, toast] })
        get().recordNotification(toast.type, toast.message, toast.id)
      })
      api.onTasks((tasks) => set({ tasks }))
    }

    const [state, versions, gameStatus, logs, tasks] = await Promise.all([
      api.getState(),
      api.getVersions().catch(() => null),
      api.getGameStatus().catch(() => 'idle' as GameStatus),
      api.getLogs().catch(() => []),
      api.listTasks().catch(() => [] as TaskInfo[])
    ])
    set({ state, versions, logs, tasks, notifications: loadNotifications() })
    get().setGameStatus(gameStatus)
  },

  refresh: async () => {
    const state = await api.getState()
    set({ state })
  },

  setPage: (page) => set({ page, openedProfileId: null }),
  openProfile: async (id) => {
    set({ openedProfileId: id, profileSection: 'overview' })
    try {
      await api.setState({ selectedProfileId: id })
      await get().refresh()
    } catch {
      get().pushToast('error', t("Не удалось сделать сборку активной"))
    }
  },
  backToInstances: () => set({ openedProfileId: null, profileSection: 'overview' }),
  setProfileSection: (section) => set({ profileSection: section }),
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
  setGameStatus: (status) => {
    const previous = get().gameStatus
    set({ gameStatus: status })
    if (status === 'crashed' && previous !== 'crashed') {
      const profileId = get().state?.selectedProfileId
      if (profileId) set({ crashProfileId: profileId })
    } else if (status !== 'crashed' && get().crashProfileId) {
      set({ crashProfileId: null })
    }
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
  closeToast: (id) => {
    const notifications = get().notifications.filter((item) => item.id !== id)
    saveNotifications(notifications)
    set({ toasts: get().toasts.filter((toast) => toast.id !== id), notifications })
  },
  pushToast: (type, message) => {
    const toast: ToastPayload = { id: `${Date.now()}-${Math.random()}`, type, message }
    set({ toasts: [...get().toasts, toast] })
    get().recordNotification(type, message, toast.id)
  },
  recordNotification: (type, message, id) => {
    const notification: NotificationRecord = {
      id: id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      message,
      time: Date.now(),
      read: false
    }
    const notifications = [...get().notifications, notification].slice(-NOTIFICATION_LIMIT)
    saveNotifications(notifications)
    set({ notifications })
  },
  markNotificationsRead: () => {
    const notifications = get().notifications.map((item) => ({ ...item, read: true }))
    saveNotifications(notifications)
    set({ notifications })
  },
  clearNotifications: () => {
    saveNotifications([])
    set({ notifications: [] })
  },
  setCrashProfileId: (id) => set({ crashProfileId: id }),
  setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  cancelTask: async (id) => { await api.cancelTask(id) },
  pauseTask: async (id) => { await api.pauseTask(id) },
  resumeTask: async (id) => { await api.resumeTask(id) },
  clearFinishedTasks: async () => { await api.clearFinishedTasks() }
}))

export function selectedProfile(state?: AppState | null) {
  if (!state) return null
  return state.profiles.find((profile) => profile.id === state.selectedProfileId) ?? state.profiles[0] ?? null
}

export function findProfile(state: AppState | null, profileId: string | null) {
  if (!state || !profileId) return null
  return state.profiles.find((profile) => profile.id === profileId) ?? null
}
