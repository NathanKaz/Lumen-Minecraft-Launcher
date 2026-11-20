import path from 'node:path'
import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import { BrowserWindow, dialog } from 'electron'
import { msg } from './i18n'
import { backupDir, instanceDir } from './paths'
import { getState } from './store'
import { emitLog, emitToast, uid } from './events'
import { getStatus } from './launch'
import type { BackupInfo, ScheduledBackupSettings } from '@shared/types'

const SCHEDULED_DEFAULTS: ScheduledBackupSettings = { enabled: false, intervalHours: 6, keepCount: 10 }

/** Missing or partially saved settings still produce a valid schedule. */
export function getScheduledBackupSettings(): ScheduledBackupSettings {
  const value = getState()?.settings?.scheduledBackup
  const bounded = (input: number | undefined, fallback: number, min: number): number =>
    typeof input === 'number' && Number.isFinite(input) ? Math.max(min, Math.floor(input)) : fallback
  return {
    enabled: value?.enabled ?? SCHEDULED_DEFAULTS.enabled,
    intervalHours: bounded(value?.intervalHours, SCHEDULED_DEFAULTS.intervalHours, 1),
    keepCount: bounded(value?.keepCount, SCHEDULED_DEFAULTS.keepCount, 1)
  }
}

function profileName(id: string): string {
  return getState().profiles.find((profile) => profile.id === id)?.name ?? id
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_\-.]/g, '_').slice(0, 60) || 'worlds'
}

export async function listBackups(profileId: string): Promise<BackupInfo[]> {
  const dir = backupDir(profileId)
  if (!(await fs.pathExists(dir))) return []
  const entries = (await fs.readdir(dir)).filter((name) => name.endsWith('.zip'))
  const result: BackupInfo[] = []
  for (const fileName of entries) {
    const full = path.join(dir, fileName)
    const stats = await fs.stat(full)
    result.push({
      fileName,
      name: path.basename(fileName, '.zip'),
      size: stats.size,
      createdAt: stats.mtimeMs
    })
  }
  return result.sort((a, b) => b.createdAt - a.createdAt)
}

export async function createBackup(profileId: string, silent = false): Promise<BackupInfo> {
  const saves = path.join(instanceDir(profileId), 'saves')
  if (!(await fs.pathExists(saves))) {
    throw new Error(msg('В сборке нет миров для резервной копии'))
  }

  const dir = backupDir(profileId)
  await fs.ensureDir(dir)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `${safeName(profileName(profileId))}-${stamp}-${uid().slice(0, 6)}.zip`
  const target = path.join(dir, fileName)
  const zip = new AdmZip()
  zip.addLocalFolder(saves, 'saves')
  await fs.writeFile(target, zip.toBuffer())
  const stats = await fs.stat(target)
  if (!silent) {
    emitToast('success', msg('Резервная копия создана'))
    emitLog('info', msg('Резервная копия создана') + `: ${fileName}`)
  }
  return { fileName, name: path.basename(fileName, '.zip'), size: stats.size, createdAt: stats.mtimeMs }
}

/** Silent pre-update backup. Skips when disabled or when the instance has no worlds. */
export async function createAutoBackup(profileId: string, reason: string): Promise<BackupInfo | null> {
  if (getState().settings.autoBackupBeforeUpdates === false) return null
  const saves = path.join(instanceDir(profileId), 'saves')
  if (!(await fs.pathExists(saves))) return null

  const dir = backupDir(profileId)
  await fs.ensureDir(dir)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `auto-${safeName(reason)}-${stamp}-${uid().slice(0, 6)}.zip`
  const target = path.join(dir, fileName)
  const zip = new AdmZip()
  zip.addLocalFolder(saves, 'saves')
  await fs.writeFile(target, zip.toBuffer())
  const stats = await fs.stat(target)
  emitLog('info', `${msg('Автобэкап перед обновлением: {reason}', { reason })}: ${fileName}`)
  return { fileName, name: path.basename(fileName, '.zip'), size: stats.size, createdAt: stats.mtimeMs }
}

/** Creates a regular backup for every instance that actually has saves. */
export async function backupAllProfiles(): Promise<number> {
  const profiles = getState().profiles
  let created = 0
  for (const profile of profiles) {
    const saves = path.join(instanceDir(profile.id), 'saves')
    if (!(await fs.pathExists(saves))) continue
    await createBackup(profile.id, true)
    created += 1
  }
  return created
}

export async function restoreBackup(profileId: string, fileName: string): Promise<void> {
  const backup = path.join(backupDir(profileId), path.basename(fileName))
  if (!(await fs.pathExists(backup))) throw new Error(msg('Резервная копия не найдена'))

  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    title: msg('Восстановить резервную копию?'),
    message: msg('Текущие миры будут заменены данными из копии «{name}».', { name: path.basename(fileName, '.zip') }),
    buttons: [msg('Отмена'), msg('Восстановить')],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  }
  const parent = BrowserWindow.getFocusedWindow()
  const answer = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
  if (answer.response !== 1) return

  const instance = instanceDir(profileId)
  const saves = path.join(instance, 'saves')
  const temp = path.join(instance, `.saves-restore-${uid()}`)
  await fs.ensureDir(temp)
  try {
    new AdmZip(backup).extractAllTo(temp, true)
    const source = path.join(temp, 'saves')
    if (!(await fs.pathExists(source))) throw new Error(msg('Архив не содержит папку saves'))
    await fs.remove(saves)
    await fs.move(source, saves)
    emitToast('success', msg('Миры восстановлены'))
  } finally {
    await fs.remove(temp)
  }
}

export async function deleteBackup(profileId: string, fileName: string): Promise<void> {
  const backup = path.join(backupDir(profileId), path.basename(fileName))
  if (!(await fs.pathExists(backup))) return
  await fs.remove(backup)
  emitToast('success', msg('Резервная копия удалена'))
}

/** Removes the oldest ZIP archives, keeping at most keepCount of them. */
async function pruneBackups(profileId: string, keepCount: number): Promise<number> {
  const backups = await listBackups(profileId)
  let removed = 0
  for (const backup of backups.slice(keepCount)) {
    await fs.remove(path.join(backupDir(profileId), path.basename(backup.fileName)))
    removed += 1
  }
  return removed
}

let timer: NodeJS.Timeout | null = null
let timerHours = 0
let tickRunning = false

async function runScheduledTick(): Promise<void> {
  if (tickRunning) return
  tickRunning = true
  try {
    const schedule = getScheduledBackupSettings()
    if (!schedule.enabled) return
    const status = getStatus()
    if (status === 'starting' || status === 'running') {
      emitLog('info', msg('Бэкап по расписанию пропущен: игра запущена'))
      return
    }
    for (const profile of getState().profiles) {
      const saves = path.join(instanceDir(profile.id), 'saves')
      if (!(await fs.pathExists(saves))) continue
      try {
        await createBackup(profile.id, true)
        const removed = await pruneBackups(profile.id, schedule.keepCount)
        emitLog('info', msg('Бэкап по расписанию: {name} · удалено старых копий: {count}', {
          name: profile.name,
          count: removed
        }))
      } catch (error) {
        emitLog('error', msg('Не удалось создать бэкап по расписанию для {name}: {error}', {
          name: profile.name,
          error: error instanceof Error ? error.message : String(error)
        }))
      }
    }
  } finally {
    tickRunning = false
  }
}

function onScheduledTick(): void {
  // Settings are re-read on every tick, so changes made in Settings take effect
  // on the next run without needing a dedicated IPC channel.
  if (getScheduledBackupSettings().intervalHours !== timerHours) {
    startScheduledBackups()
    return
  }
  void runScheduledTick()
}

/** Starts the interval in the main process; safe to call more than once. */
export function startScheduledBackups(): void {
  stopScheduledBackups()
  const schedule = getScheduledBackupSettings()
  timerHours = schedule.intervalHours
  timer = setInterval(onScheduledTick, schedule.intervalHours * 60 * 60 * 1000)
  timer.unref()
}

export function stopScheduledBackups(): void {
  if (timer) clearInterval(timer)
  timer = null
  timerHours = 0
}

/** Re-reads the interval and rebuilds the timer, e.g. after settings change. */
export function restartScheduledBackups(): void {
  startScheduledBackups()
}
