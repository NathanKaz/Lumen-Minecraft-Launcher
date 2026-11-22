import path from 'node:path'
import { dialog } from 'electron'
import fs from 'fs-extra'
import { msg } from './i18n'
import { emitToast } from './events'
import { dirs } from './paths'
import { getState, setState } from './store'
import { buildSettingsExport, parseSettingsImport } from '@shared/settingsTransfer'
import type { AppState } from '@shared/types'

/** Writes a portable settings file. Tokens and API keys are never included. */
export async function exportLauncherSettings(): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    title: msg('Экспорт настроек лаунчера'),
    defaultPath: path.join(dirs.root, 'lumen-settings.json'),
    filters: [
      { name: msg('Файл настроек JSON'), extensions: ['json'] },
      { name: msg('Все файлы'), extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePath) return null
  const json = buildSettingsExport(getState().settings)
  await fs.writeFile(result.filePath, json, 'utf8')
  emitToast('success', msg('Настройки экспортированы: {path}', { path: result.filePath }))
  return json
}

/** Applies a previously exported file, keeping this machine's secret values. */
export async function importLauncherSettings(): Promise<AppState | null> {
  const result = await dialog.showOpenDialog({
    title: msg('Импорт настроек лаунчера'),
    filters: [
      { name: msg('Файл настроек JSON'), extensions: ['json'] },
      { name: msg('Все файлы'), extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths[0]) return null
  const text = await fs.readFile(result.filePaths[0], 'utf8')
  const safe = parseSettingsImport(text)
  const current = getState().settings
  const next = setState({
    settings: {
      ...current,
      ...safe,
      msaClientId: current.msaClientId,
      curseforgeApiKey: current.curseforgeApiKey
    }
  })
  emitToast('success', msg('Настройки импортированы из файла: {path}', { path: result.filePaths[0] }))
  return next
}
