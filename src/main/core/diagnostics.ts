import path from 'node:path'
import { promises as fsp } from 'node:fs'
import fs from 'fs-extra'
import { msg } from './i18n'
import { dirs, instanceDir } from './paths'
import { requiredJavaMajor } from './java'
import { getState } from './store'
import type {
  CrashAnalysis,
  CrashCause,
  CrashReportInfo,
  CrashSuggestion,
  LogFileContent,
  LogFileInfo
} from '@shared/types'

const LOG_LIMIT = 50
const CRASH_LIMIT = 20
const MAX_LOG_BYTES = 200 * 1024
const MAX_CRASH_BYTES = 20 * 1024

function logDirectory(profileId?: string): string {
  return profileId ? path.join(instanceDir(profileId), 'logs') : dirs.logs
}

function crashDirectory(profileId?: string): string {
  return profileId ? path.join(instanceDir(profileId), 'crash-reports') : path.join(dirs.logs, 'crash-reports')
}

/** Reads only the newest bytes so large game logs never block the renderer. */
async function readTail(filePath: string, limit: number): Promise<string> {
  const handle = await fsp.open(filePath, 'r')
  try {
    const stats = await handle.stat()
    const bytes = Math.min(stats.size, limit)
    const buffer = Buffer.alloc(bytes)
    if (bytes > 0) await handle.read(buffer, 0, bytes, stats.size - bytes)
    return buffer.toString('utf8').replace(/^\uFEFF/, '')
  } finally {
    await handle.close()
  }
}

/** Accepts plain file names only — no traversal outside the logs directory. */
function validateFileName(name: string): string {
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..') || path.basename(name) !== name) {
    throw new Error(msg('Недопустимое имя файла'))
  }
  return name
}

/** Log files of the active instance, or the launcher-wide logs directory. */
export async function getLogFiles(profileId?: string): Promise<LogFileInfo[]> {
  const directory = logDirectory(profileId)
  if (!(await fs.pathExists(directory))) return []
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const result: LogFileInfo[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    try {
      const stats = await fs.stat(path.join(directory, entry.name))
      result.push({ name: entry.name, size: stats.size, modifiedAt: stats.mtimeMs })
    } catch {
      // The file may have been rotated or removed while reading the directory.
    }
  }
  return result.sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, LOG_LIMIT)
}

/** Tail of a log file, capped to keep IPC payloads small. */
export async function readLogFile(profileId: string | undefined, name: string): Promise<LogFileContent> {
  const safe = validateFileName(name)
  const target = path.join(logDirectory(profileId), safe)
  const stats = await fs.stat(target).catch(() => null)
  if (!stats?.isFile()) throw new Error(msg('Файл не найден'))
  return { name: safe, text: await readTail(target, MAX_LOG_BYTES) }
}

/** Minecraft crash reports, including the newest part of their text. */
export async function listCrashReports(profileId?: string): Promise<CrashReportInfo[]> {
  const directory = crashDirectory(profileId)
  if (!(await fs.pathExists(directory))) return []
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const result: CrashReportInfo[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.txt')) continue
    const full = path.join(directory, entry.name)
    try {
      const stats = await fs.stat(full)
      result.push({
        name: entry.name,
        size: stats.size,
        modifiedAt: stats.mtimeMs,
        text: await readTail(full, MAX_CRASH_BYTES)
      })
    } catch {
      // Skip reports that disappeared or cannot be read.
    }
  }
  return result.sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, CRASH_LIMIT)
}

const CRASH_PATTERNS: Array<{ cause: CrashCause; pattern: RegExp }> = [
  { cause: 'memory', pattern: /OutOfMemoryError|Java heap space|Memory allocation failed|GC overhead limit/i },
  { cause: 'java', pattern: /UnsupportedClassVersionError|class file version|NoClassDefFoundError:\s*java\/|IllegalAccessError.*java\//i },
  { cause: 'mod', pattern: /ModLoadingException|ModLoadingError|DuplicateModsFoundException|MixinApplyError|Mixin apply|mod loading|Dependency.*not found|Conflicting mod/i },
  { cause: 'version', pattern: /Unsupported Minecraft version|Minecraft version.*(mismatch|not supported)|Incompatible Minecraft version/i }
]

function crashSuggestions(
  cause: CrashCause,
  hasReport: boolean,
  requiredJava: number
): CrashSuggestion[] {
  const result: CrashSuggestion[] = []
  if (cause === 'memory') {
    result.push({
      id: 'memory',
      title: msg('Увеличить память сборки'),
      description: msg('Выделите больше ОЗУ для Minecraft (сейчас рекомендуется не менее {memory} МБ).', { memory: requiredJava >= 21 ? 4096 : 2048 }),
      action: 'increaseMemory'
    })
    result.push({
      id: 'java-settings',
      title: msg('Проверить настройки Java и памяти'),
      description: msg('Проверьте путь к Java и объём выделенной памяти.'),
      action: 'openSettings'
    })
  } else if (cause === 'java') {
    result.push({
      id: 'java',
      title: msg('Установить подходящую Java'),
      description: msg('Для этой версии Minecraft нужна Java {major} или новее.', { major: requiredJava }),
      action: 'installJava'
    })
    result.push({
      id: 'java-settings',
      title: msg('Указать другую Java вручную'),
      description: msg('Откройте настройки и выберите установленную Java.'),
      action: 'openSettings'
    })
  } else if (cause === 'mod') {
    result.push({
      id: 'mods',
      title: msg('Открыть список модов'),
      description: msg('Проверьте дубликаты, несовместимые загрузчики и недавно добавленные моды.'),
      action: 'openMods'
    })
    result.push({
      id: 'verify',
      title: msg('Проверить файлы сборки'),
      description: msg('Лаунчер восстановит отсутствующие или повреждённые файлы.'),
      action: 'verifyFiles'
    })
  } else if (cause === 'version') {
    result.push({
      id: 'verify',
      title: msg('Проверить файлы сборки'),
      description: msg('Версия клиента может не соответствовать версии сборки.'),
      action: 'verifyFiles'
    })
    result.push({
      id: 'mods',
      title: msg('Проверить совместимость модов'),
      description: msg('Моды могут быть собраны для другой версии Minecraft.'),
      action: 'openMods'
    })
  } else {
    result.push({
      id: 'verify',
      title: msg('Проверить файлы сборки'),
      description: msg('Восстановите клиент, библиотеки и ассеты по контрольным суммам.'),
      action: 'verifyFiles'
    })
  }
  if (hasReport) {
    result.push({
      id: 'report',
      title: msg('Открыть полный отчёт о сбое'),
      description: msg('Отчёт содержит полный стек вызовов и список загруженных модов.'),
      action: 'openReport'
    })
  }
  return result
}

/** Looks for the most likely cause of a crash using crash reports and logs. */
export async function analyzeCrash(profileId: string): Promise<CrashAnalysis> {
  const profile = getState().profiles.find((entry) => entry.id === profileId)
  const requiredJava = requiredJavaMajor(profile?.versionId ?? '1.20.1')
  const reports = await listCrashReports(profileId)
  const report = reports[0]
  const logs = await getLogFiles(profileId)
  let logText = ''
  for (const file of logs.slice(0, 3)) {
    try {
      const log = await readLogFile(profileId, file.name)
      logText += `${log.text}\n`
    } catch {
      // A rotated log is not fatal for the analysis.
    }
  }
  const text = `${report?.text ?? ''}\n${logText}`
  const match = CRASH_PATTERNS.find((entry) => entry.pattern.test(text))
  const cause = match?.cause ?? 'unknown'

  const details = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(Caused by:|Description:|Stacktrace:|.*(Exception|Error):)/i.test(line) && line.length < 260)
    .filter((line, index, all) => all.indexOf(line) === index)
    .slice(0, 6)

  const summary = cause === 'memory'
    ? msg('Не хватает памяти. Увеличьте объём ОЗУ для сборки.')
    : cause === 'java'
      ? msg('Версия Java не подходит для этой версии Minecraft.')
      : cause === 'mod'
        ? msg('Похоже, проблема в моде или конфликте модов.')
        : cause === 'version'
          ? msg('Несовместимость версии клиента и сборки.')
          : cause === 'unknown' && report
            ? msg('Причина сбоя не определена автоматически. Откройте полный отчёт.')
            : msg('Причина сбоя не определена автоматически. Проверьте файлы сборки.')

  return {
    profileId,
    detected: Boolean(report) || Boolean(text.trim()),
    cause,
    summary,
    details,
    reportName: report?.name,
    reportText: report?.text,
    suggestions: crashSuggestions(cause, Boolean(report), requiredJava)
  }
}
