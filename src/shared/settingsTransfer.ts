import { HOTKEY_DEFINITIONS } from './hotkeys'
import type { AccentColor, Hotkeys, ProfileSort, ScheduledBackupSettings, Settings, ThemeMode } from './types'

export const SETTINGS_EXPORT_FORMAT = 'lumen-settings'
const SETTINGS_EXPORT_VERSION = 1

export interface SettingsExport {
  format: string
  version: number
  exportedAt: number
  settings: Partial<Settings>
}

const secretKeys: Array<keyof Settings> = ['msaClientId', 'curseforgeApiKey']

/** Secrets stay on the current machine: a shared file must never contain tokens or API keys. */
export function buildSettingsExport(settings: Settings): string {
  const copy: Record<string, unknown> = { ...settings }
  for (const key of secretKeys) delete copy[key]
  const payload: SettingsExport = {
    format: SETTINGS_EXPORT_FORMAT,
    version: SETTINGS_EXPORT_VERSION,
    exportedAt: Date.now(),
    settings: copy as Partial<Settings>
  }
  return JSON.stringify(payload, null, 2)
}

const num = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback
}
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)
const str = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.length <= max ? value : undefined
const oneOf = <T extends string>(value: unknown, values: readonly T[]): T | undefined =>
  typeof value === 'string' && (values as readonly string[]).includes(value) ? (value as T) : undefined

/** Strictly validates an imported file before it reaches the launcher state. */
export function parseSettingsImport(text: string): Partial<Settings> {
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error('Файл настроек повреждён или не является JSON')
  }
  if (!payload || typeof payload !== 'object') throw new Error('Неверный формат файла настроек')
  const file = payload as Partial<SettingsExport>
  if (file.format !== SETTINGS_EXPORT_FORMAT) throw new Error('Это не файл настроек Lumen Launcher')
  if (!file.settings || typeof file.settings !== 'object') throw new Error('В файле нет настроек')
  const source = file.settings as Record<string, unknown>
  const result: Partial<Settings> = {}

  const javaPath = str(source.javaPath, 4096)
  if (javaPath !== undefined) result.javaPath = javaPath
  if (source.memory !== undefined) result.memory = num(source.memory, 1024, 16384, 2048)
  if (source.width !== undefined) result.width = num(source.width, 640, 4096, 1280)
  if (source.height !== undefined) result.height = num(source.height, 360, 2160, 720)
  if (source.fullscreen !== undefined) result.fullscreen = bool(source.fullscreen, false)
  const language = oneOf(source.language, ['ru', 'en'] as const)
  if (language) result.language = language
  const closeBehavior = oneOf(source.closeBehavior, ['exit', 'tray'] as const)
  if (closeBehavior) result.closeBehavior = closeBehavior
  if (source.checkUpdates !== undefined) result.checkUpdates = bool(source.checkUpdates, true)
  const instancesView = oneOf(source.instancesView, ['grid', 'list'] as const)
  if (instancesView) result.instancesView = instancesView
  if (source.autoBackupBeforeUpdates !== undefined) result.autoBackupBeforeUpdates = bool(source.autoBackupBeforeUpdates, true)
  if (source.autoInstallJava !== undefined) result.autoInstallJava = bool(source.autoInstallJava, true)
  if (source.onboardingCompleted !== undefined) result.onboardingCompleted = bool(source.onboardingCompleted, true)
  const activeSkinId = str(source.activeSkinId, 200)
  if (activeSkinId !== undefined) result.activeSkinId = activeSkinId
  const theme = oneOf<ThemeMode>(source.theme, ['dark', 'light'])
  if (theme) result.theme = theme
  const accent = oneOf<AccentColor>(source.accent, ['mint', 'violet', 'sky', 'amber', 'rose'])
  if (accent) result.accent = accent
  const profileSort = oneOf<ProfileSort>(source.profileSort, ['default', 'name', 'lastPlayed', 'playtime'])
  if (profileSort) result.profileSort = profileSort

  if (source.scheduledBackup && typeof source.scheduledBackup === 'object') {
    const raw = source.scheduledBackup as Record<string, unknown>
    const backup: ScheduledBackupSettings = {
      enabled: bool(raw.enabled, false),
      intervalHours: num(raw.intervalHours, 1, 720, 6),
      keepCount: num(raw.keepCount, 1, 100, 10)
    }
    result.scheduledBackup = backup
  }
  if (source.accessibility && typeof source.accessibility === 'object') {
    const raw = source.accessibility as Record<string, unknown>
    result.accessibility = {
      uiScale: num(raw.uiScale, 0.8, 1.3, 1),
      compact: bool(raw.compact, false),
      reducedMotion: bool(raw.reducedMotion, false)
    }
  }
  if (source.hotkeys && typeof source.hotkeys === 'object') {
    const raw = source.hotkeys as Record<string, unknown>
    const hotkeys: Partial<Hotkeys> = {}
    for (const definition of HOTKEY_DEFINITIONS) {
      const value = raw[definition.id]
      if (typeof value === 'string' && value.length <= 60 && /^[\w/+]+$/.test(value)) {
        hotkeys[definition.id] = value
      }
    }
    result.hotkeys = hotkeys
  }
  return result
}
