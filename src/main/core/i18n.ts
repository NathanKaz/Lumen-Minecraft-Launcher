import { translate, type TranslateParams } from '@shared/i18n'
import { getState } from './store'

/** Translates user-facing main-process messages using the saved language. */
export function msg(key: string, params?: TranslateParams): string {
  const language = getState()?.settings.language ?? 'ru'
  return translate(key, language, params)
}
