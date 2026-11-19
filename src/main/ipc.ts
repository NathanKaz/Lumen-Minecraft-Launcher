import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { msg } from './core/i18n'
import fs from 'fs-extra'
import { IPC } from '@shared/ipc'
import type { AppState, LogPayload, Profile } from '@shared/types'
import { dirs, instanceDir, modsDir, screenshotsDir } from './core/paths'
import {
  createProfile,
  deleteProfile,
  getState,
  setAccountName,
  setState,
  updateProfile
} from './core/store'
import { emitToast, emitLog, getLogs, clearLogs, uid } from './core/events'
import { getVersionList, installProfile } from './core/versions'
import { getStatus, launchGame, stopGame } from './core/launch'
import { copyModFile, deleteMod, listMods, toggleMod } from './core/mods'
import { getProjectDetails, installMod, searchMods, searchModpacks } from './core/modrinth'
import { installModpackFromFile, installModpackFromModrinth, installModpackFromPath } from './core/modpacks'
import { deletionSummary, deleteScreenshot, listScreenshots } from './core/screenshots'
import { detectJava, getJavaInfo } from './core/java'
import { ensureJava } from './core/javaInstall'
import { deleteSkin, importSkin, listSkins, selectSkin, setSkinModel } from './core/skins'
import { checkUpdates } from './core/updates'
import { repairProfile, verifyProfile } from './core/verify'
import { backupAllProfiles, createBackup, deleteBackup, listBackups, restoreBackup } from './core/backups'
import { exportProfiles, importProfiles } from './core/profileTransfer'
import { deletePack, installPack, listPacks, togglePack } from './core/packs'
import { checkModUpdates, updateMod } from './core/modUpdates'

function handle(channel: string, fn: (...args: any[]) => unknown): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      return await fn(...args)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      emitLog('error', message)
      emitToast('error', message)
      throw error
    }
  })
}

export function registerIpc(): void {
  handle(IPC.getState, (): AppState => getState())
  handle(IPC.setState, (patch: Partial<AppState>) => setState(patch))
  handle(IPC.setAccount, (name: string) => setAccountName(name))
  handle(IPC.createProfile, (profile: Profile) => createProfile(profile))
  handle(IPC.updateProfile, (id: string, patch: Partial<Profile>) => updateProfile(id, patch))

  // Confirmation happens here so the native dialog shows exactly what will be deleted.
  handle(IPC.confirmDeleteProfile, async (id: string): Promise<boolean> => {
    const summary = await deletionSummary(id)
    const detail = [
      msg("Безвозвратно удалятся:"),
      msg("• миры (saves)"),
      msg("• моды (mods)"),
      msg("• скриншоты (screenshots)"),
      msg("• конфиги, ресурс- и шейдерпаки, options.txt"),
      msg("• журналы и отчёты об ошибках"),
      msg("• запись о сборке в лаунчере"),
      '',
      msg('Папка сборки: {path}', { path: summary.path }),
      summary.directories.length ? msg('Обнаружено на диске: {paths}', { paths: summary.directories.join(', ') }) : ''
    ].filter(Boolean).join('\n')
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
    const result = await dialog.showMessageBox(parent, {
      type: 'warning',
      title: msg('Удалить сборку «{name}»?', { name: summary.name }),
      message: msg('Сборка «{name}» будет удалена из лаунчера вместе со всей папкой игры.', { name: summary.name }),
      detail,
      buttons: [msg("Удалить"), msg("Отмена")],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    })
    return result.response === 0
  })

  handle(IPC.deleteProfile, async (id: string) => {
    const profile = getState().profiles.find((entry) => entry.id === id)
    const result = deleteProfile(id)
    if (profile) {
      await fs.remove(instanceDir(id))
      emitLog('info', msg('Удалена сборка «{name}»: {path}', { name: profile.name, path: instanceDir(id) }))
      emitToast('info', msg('Сборка «{name}» и её файлы удалены', { name: profile.name }))
    }
    return result
  })

  handle(IPC.getVersions, () => getVersionList())
  handle(IPC.installProfile, (id: string) => installProfile(id))
  handle(IPC.launch, (id: string) => launchGame(id))
  handle(IPC.stopGame, () => stopGame())
  handle(IPC.getGameStatus, () => getStatus())
  handle(IPC.listMods, (id: string) => listMods(id))
  handle(IPC.toggleMod, (id: string, fileName: string) => toggleMod(id, fileName))
  handle(IPC.deleteMod, (id: string, fileName: string) => deleteMod(id, fileName))
  handle(IPC.installModFile, (id: string, source: string) => copyModFile(id, source))
  handle(IPC.searchMods, (query: string, gameVersion?: string, loader?: string, offset?: number) =>
    searchMods(query, gameVersion, loader, offset)
  )
  handle(IPC.installMod, (id: string, projectId: string) => installMod(id, projectId))
  handle(IPC.searchModpacks, (query: string) => searchModpacks(query))
  handle(IPC.getProjectDetails, (projectId: string) => getProjectDetails(projectId))
  handle(IPC.installModpack, (id: string) => installModpackFromFile(id))
  handle(IPC.installModpackFilePath, (id: string, filePath: string) => installModpackFromPath(id, filePath))
  handle(IPC.installModpackFromModrinth, (id: string, projectId: string) => installModpackFromModrinth(id, projectId))
  handle(IPC.listScreenshots, (profileId?: string) => listScreenshots(profileId))
  handle(IPC.deleteScreenshot, (profileId: string, fileName: string) => deleteScreenshot(profileId, fileName))
  handle(IPC.getJavaInfo, () => getJavaInfo())
  handle(IPC.detectJava, () => detectJava())
  handle(IPC.ensureJava, (major?: number, profileId?: string, explicit?: boolean) =>
    ensureJava(major, profileId, explicit)
  )
  handle(IPC.getLogs, (): LogPayload[] => getLogs())
  handle(IPC.clearLogs, () => clearLogs())

  // Skins
  handle(IPC.listSkins, () => listSkins())
  handle(IPC.importSkin, () => importSkin())
  handle(IPC.deleteSkin, (id: string) => deleteSkin(id))
  handle(IPC.selectSkin, (id: string | null) => selectSkin(id))
  handle(IPC.setSkinModel, (id: string, model: 'wide' | 'slim') => setSkinModel(id, model))

  // Updates & verification
  handle(IPC.checkUpdates, () => checkUpdates())
  handle(IPC.verifyProfile, (id: string, repair?: boolean) => verifyProfile(id, repair))
  handle(IPC.repairProfile, (id: string) => repairProfile(id))

  // Backups
  handle(IPC.listBackups, (profileId: string) => listBackups(profileId))
  handle(IPC.createBackup, (profileId: string) => createBackup(profileId))
  handle(IPC.restoreBackup, (profileId: string, fileName: string) => restoreBackup(profileId, fileName))
  handle(IPC.deleteBackup, (profileId: string, fileName: string) => deleteBackup(profileId, fileName))
  handle(IPC.backupAllProfiles, () => backupAllProfiles())

  // Instance transfer
  handle(IPC.exportProfiles, (profileIds: string[]) => exportProfiles(profileIds))
  handle(IPC.importProfiles, () => importProfiles())

  // Resource/shader packs
  handle(IPC.listPacks, (profileId: string, kind: 'resource' | 'shader') => listPacks(profileId, kind))
  handle(IPC.installPack, (profileId: string, kind: 'resource' | 'shader') => installPack(profileId, kind))
  handle(IPC.togglePack, (profileId: string, kind: 'resource' | 'shader', fileName: string, enabled: boolean) =>
    togglePack(profileId, kind, fileName, enabled)
  )
  handle(IPC.deletePack, (profileId: string, kind: 'resource' | 'shader', fileName: string) =>
    deletePack(profileId, kind, fileName)
  )

  // Mod updates
  handle(IPC.checkModUpdates, (profileId: string) => checkModUpdates(profileId))
  handle(IPC.updateMod, (profileId: string, fileName: string, versionId: string) => updateMod(profileId, fileName, versionId))

  ipcMain.handle(IPC.installLocalMod, async (_event, profileId: string) => {
    const result = await dialog.showOpenDialog({
      title: msg("Выберите файлы модов"),
      filters: [
        { name: msg("Моды"), extensions: ['jar', 'zip'] },
        { name: msg("Все файлы"), extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled) return
    for (const file of result.filePaths) await copyModFile(profileId, file)
    emitToast('success', msg('Установлено модов: {count}', { count: result.filePaths.length }))
  })

  ipcMain.handle(IPC.openFolder, async (_event, kind: 'root' | 'instances' | 'mods' | 'screenshots' | 'logs') => {
    const profileId = getState().selectedProfileId
    const targets: Record<typeof kind, string> = {
      root: dirs.root,
      instances: dirs.instances,
      mods: modsDir(profileId),
      screenshots: screenshotsDir(profileId),
      logs: dirs.logs
    }
    const target = targets[kind]
    await fs.ensureDir(target)
    await shell.openPath(target)
  })

  ipcMain.handle(IPC.windowAction, (_event, action: 'minimize' | 'maximize' | 'close') => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (action === 'minimize') win.minimize()
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize()
    else win.close()
  })

  ipcMain.on('log:renderer', (_event, level: LogPayload['level'], message: string) => {
    emitLog(level, `[renderer] ${message}`)
  })
}

export function newId(): string {
  return uid()
}
