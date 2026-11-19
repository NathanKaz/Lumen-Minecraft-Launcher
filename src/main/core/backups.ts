import path from 'node:path'
import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import { BrowserWindow, dialog } from 'electron'
import { msg } from './i18n'
import { backupDir, instanceDir } from './paths'
import { getState } from './store'
import { emitLog, emitToast, uid } from './events'
import type { BackupInfo } from '@shared/types'

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
