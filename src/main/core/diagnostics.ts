import path from 'node:path'
import { promises as fsp } from 'node:fs'
import fs from 'fs-extra'
import { msg } from './i18n'
import { dirs, instanceDir } from './paths'
import type { CrashReportInfo, LogFileContent, LogFileInfo } from '@shared/types'

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
