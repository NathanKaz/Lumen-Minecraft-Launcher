import type { HotkeyAction, Hotkeys, Settings } from './types'

export type { HotkeyAction } from './types'

export interface HotkeyDefinition {
  id: HotkeyAction
  label: string
  hint: string
  default: string
  keywords: string
}

/** Order here is also the order shown in Settings and in the shortcut sheet. */
export const HOTKEY_DEFINITIONS: HotkeyDefinition[] = [
  { id: 'globalSearch', label: 'Глобальный поиск', hint: 'Открыть палитру команд', default: 'Ctrl+K', keywords: 'search palette find command' },
  { id: 'showShortcuts', label: 'Список горячих клавиш', hint: 'Показать шпаргалку', default: 'Ctrl+/', keywords: 'hotkeys shortcuts help' },
  { id: 'launchLast', label: 'Продолжить игру', hint: 'Запустить последнюю сборку', default: 'Ctrl+Alt+P', keywords: 'launch play last continue' },
  { id: 'stopGame', label: 'Остановить игру', hint: 'Завершить запущенную игру', default: 'Ctrl+Alt+S', keywords: 'stop game kill' },
  { id: 'home', label: 'Главная', hint: 'Открыть главную страницу', default: 'Ctrl+Alt+H', keywords: 'home main' },
  { id: 'library', label: 'Библиотека сборок', hint: 'Открыть список сборок', default: 'Ctrl+Alt+L', keywords: 'library instances builds' },
  { id: 'mods', label: 'Моды активной сборки', hint: 'Открыть вкладку модов', default: 'Ctrl+Alt+M', keywords: 'mods jars' },
  { id: 'settings', label: 'Настройки', hint: 'Открыть настройки лаунчера', default: 'Ctrl+Alt+O', keywords: 'settings preferences' },
  { id: 'backupAll', label: 'Бэкап всех миров', hint: 'Создать копии миров всех сборок', default: 'Ctrl+Alt+B', keywords: 'backup worlds save' },
  { id: 'toggleTheme', label: 'Сменить тему', hint: 'Переключить светлую и тёмную тему', default: 'Ctrl+Alt+T', keywords: 'theme light dark' }
]

export const DEFAULT_HOTKEYS: Hotkeys = HOTKEY_DEFINITIONS.reduce((result, definition) => {
  result[definition.id] = definition.default
  return result
}, {} as Hotkeys)

/** Merges saved shortcuts with built-in defaults so older settings stay valid. */
export function resolveHotkeys(overrides?: Partial<Hotkeys>): Hotkeys {
  return { ...DEFAULT_HOTKEYS, ...(overrides ?? {}) }
}

export function hotkeysFromSettings(settings: Settings | undefined): Hotkeys {
  return resolveHotkeys(settings?.hotkeys)
}

export interface KeyComboInput {
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  key: string
}

function comboKey(key: string): string {
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key
}

/** Converts a keyboard event into a canonical shortcut string, or null for bare modifiers. */
export function comboFromEvent(event: KeyComboInput): string | null {
  const key = comboKey(event.key)
  if (['CONTROL', 'ALT', 'SHIFT', 'META'].includes(key.toUpperCase())) return null
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Cmd')
  parts.push(key)
  return parts.join('+')
}

export function comboMatches(combo: string, event: KeyComboInput): boolean {
  const parts = combo.split('+')
  const key = parts[parts.length - 1]
  return (
    parts.includes('Ctrl') === event.ctrlKey &&
    parts.includes('Alt') === event.altKey &&
    parts.includes('Shift') === event.shiftKey &&
    parts.includes('Cmd') === event.metaKey &&
    comboKey(event.key).toLowerCase() === key.toLowerCase()
  )
}

/** Platform-friendly display form; macOS uses its own modifier glyphs. */
export function formatShortcut(combo: string, mac = false): string {
  return combo
    .split('+')
    .map((part) => {
      if (part === 'Ctrl') return mac ? '⌃' : 'Ctrl'
      if (part === 'Alt') return mac ? '⌥' : 'Alt'
      if (part === 'Shift') return mac ? '⇧' : 'Shift'
      if (part === 'Cmd') return mac ? '⌘' : 'Win'
      if (part === 'Space') return mac ? '␣' : 'Space'
      return part
    })
    .join(mac ? '' : '+')
}
