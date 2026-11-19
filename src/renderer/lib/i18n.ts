import { localeTag, translate, type Locale, type TranslateParams } from '@shared/i18n'

let currentLocale: Locale = 'ru'

/** Updated by App on every state change; keeps plain helpers translatable too. */
export function setLocale(locale: Locale): void {
  currentLocale = locale
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}

/** Translate a UI string using the currently selected interface language. */
export function t(key: string, params?: TranslateParams): string {
  return translate(key, currentLocale, params)
}

export function getLocale(): Locale {
  return currentLocale
}

export function useLocaleTag(): string {
  return localeTag(currentLocale)
}

/** Size formatting with localized units. */
export function formatSize(bytes: number): string {
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(2)} ${t('ГБ')}`
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} ${t('МБ')}`
  return `${Math.max(1, Math.round(bytes / 1000))} ${t('КБ')}`
}

/** Transfer speed formatting with localized units. */
export function formatSpeed(bytesPerSecond: number): string {
  return bytesPerSecond > 1e6
    ? `${(bytesPerSecond / 1e6).toFixed(1)} ${t('МБ/с')}`
    : `${Math.round(bytesPerSecond / 1000)} ${t('КБ/с')}`
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat(localeTag(currentLocale)).format(value)
}

export type { Locale, TranslateParams }
