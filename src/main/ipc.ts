import path from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { msg } from './core/i18n'
import fs from 'fs-extra'
import { IPC } from '@shared/ipc'
import type { AppState, LogPayload, Profile } from '@shared/types'
import { dirs, instanceDir, modsDir, savesDir, screenshotsDir } from './core/paths'
import {
  addAccount,
  createProfile,
  deleteAccount,
  deleteProfile,
  getState,
  renameAccount,
  selectAccount,
  setAccountName,
  setState,
  updateProfile
} from './core/store'
import { emitToast, emitLog, getLogs, clearLogs, uid } from './core/events'
import { cancelTask, clearFinishedTasks, listTasks, pauseTask, resumeTask, runTaskAndWait } from './core/tasks'
import { getVersionList, installProfile } from './core/versions'
import { getStatus, launchGame, stopGame } from './core/launch'
import {
  analyzeMods,
  copyModFile,
  deleteMod,
  exportModList,
  importModList,
  listMods,
  setModsEnabled,
  toggleMod
} from './core/mods'
import { getProjectDetails, installMod, searchMods, searchModpacks } from './core/modrinth'
import {
  copyWorld,
  deleteWorld,
  exportWorld,
  importWorldFile,
  installWorld,
  listWorlds,
  renameWorld,
  searchWorlds
} from './core/worlds'
import { installModpackFromFile, installModpackFromModrinth, installModpackFromPath } from './core/modpacks'
import { deletionSummary, deleteScreenshot, listScreenshots } from './core/screenshots'
import { detectJava, getJavaInfo } from './core/java'
import { ensureJava } from './core/javaInstall'
import { deleteSkin, importSkin, listSkins, selectSkin, setSkinModel } from './core/skins'
import {
  checkUpdates,
  downloadUpdate,
  getLauncherInfo,
  installUpdate,
  openExternal
} from './core/updates'
import { offlineUuid } from '@shared/uuid'
import { repairProfile, verifyProfile } from './core/verify'
import { backupAllProfiles, createBackup, deleteBackup, listBackups, restoreBackup } from './core/backups'
import { exportProfiles, importProfiles } from './core/profileTransfer'
import { deletePack, installPack, listPacks, togglePack } from './core/packs'
import { checkModUpdates, updateAllMods, updateMod } from './core/modUpdates'
import { installCatalogProject, searchCatalog } from './core/catalog'
import { analyzeCrash, getLogFiles, listCrashReports, readLogFile } from './core/diagnostics'
import { importDroppedFile } from './core/fileDrop'
import { detectImportSources, importLauncherProfile } from './core/importLaunchers'
import { forgetMicrosoftToken, loginMicrosoft, logoutMicrosoft, refreshMicrosoft } from './core/msa'

function handle(channel: string, fn: (...args: any[]) => unknown): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      return await fn(...args)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      if (err.name === 'AbortError' || err.message === 'TASK_ABORTED') {
        emitLog('info', msg('Задача отменена'))
        throw err
      }
      const message = err.message
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
  handle(IPC.addAccount, (name: string) => addAccount(name))
  handle(IPC.loginMicrosoft, () => loginMicrosoft())
  handle(IPC.refreshMicrosoft, (id: string) => refreshMicrosoft(id))
  handle(IPC.logoutMicrosoft, (id: string) => logoutMicrosoft(id))
  handle(IPC.selectAccount, (id: string) => selectAccount(id))
  handle(IPC.renameAccount, (id: string, name: string) => renameAccount(id, name))
  handle(IPC.deleteAccount, (id: string) => {
    const next = deleteAccount(id)
    forgetMicrosoftToken(id)
    return next
  })
  handle(IPC.confirmDeleteAccount, (id: string) => {
    const state = getState()
    const account = state.accounts.find((entry) => entry.id === id)
    if (!account || state.accounts.length <= 1) return false
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
    return dialog.showMessageBox(parent, {
      type: 'warning',
      title: msg('Удалить профиль «{name}»?', { name: account.name }),
      message: msg('Профиль игрока будет удалён из лаунчера.'),
      detail: msg('Сборки профиля останутся на диске, но станут недоступны из лаунчера.'),
      buttons: [msg("Удалить"), msg("Отмена")],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    }).then((result) => result.response === 0)
  })
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
  handle(IPC.installProfile, (id: string) => {
    const profile = getState().profiles.find((entry) => entry.id === id)
    return runTaskAndWait({
      label: msg('Установка {name}', { name: profile?.name ?? id }),
      phase: 'version',
      run: ({ signal, taskId }) => installProfile(id, undefined, false, { signal, taskId })
    })
  })
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
  handle(IPC.installMod, (id: string, projectId: string) =>
    runTaskAndWait({
      label: msg('Установка мода'),
      phase: 'mod',
      run: ({ signal, taskId }) => installMod(id, projectId, { signal, taskId })
    })
  )
  handle(IPC.searchModpacks, (query: string) => searchModpacks(query))
  handle(IPC.searchWorlds, (query: string) => searchWorlds(query))
  handle(IPC.installWorld, (profileId: string, projectId: string) =>
    runTaskAndWait({
      label: msg('Установка мира'),
      phase: 'world',
      run: ({ signal, taskId }) => installWorld(profileId, projectId, { signal, taskId })
    })
  )
  handle(IPC.getProjectDetails, (projectId: string) => getProjectDetails(projectId))
  handle(IPC.installModpack, (id: string) =>
    runTaskAndWait({
      label: msg('Установка модпака'),
      phase: 'modpack',
      run: ({ signal, taskId }) => installModpackFromFile(id, { signal, taskId })
    })
  )
  handle(IPC.installModpackFilePath, (id: string, filePath: string) =>
    runTaskAndWait({
      label: msg('Установка модпака'),
      phase: 'modpack',
      run: ({ signal, taskId }) => installModpackFromPath(id, filePath, { signal, taskId })
    })
  )
  handle(IPC.installModpackFromModrinth, (id: string, projectId: string) =>
    runTaskAndWait({
      label: msg('Установка модпака'),
      phase: 'modpack',
      run: ({ signal, taskId }) => installModpackFromModrinth(id, projectId, { signal, taskId })
    })
  )
  handle(IPC.listScreenshots, (profileId?: string) => listScreenshots(profileId))
  handle(IPC.deleteScreenshot, (profileId: string, fileName: string) => deleteScreenshot(profileId, fileName))
  handle(IPC.getJavaInfo, () => getJavaInfo())
  handle(IPC.detectJava, () => detectJava())
  handle(IPC.ensureJava, (major?: number, profileId?: string, explicit?: boolean) =>
    runTaskAndWait({
      label: msg('Установка Java {version}', { version: major ?? '' }).trim(),
      phase: 'java',
      run: ({ signal, taskId }) => ensureJava(major, profileId, explicit, { signal, taskId })
    })
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
  handle(IPC.downloadUpdate, () => downloadUpdate())
  handle(IPC.installUpdate, (download: Parameters<typeof installUpdate>[0]) => installUpdate(download))
  handle(IPC.getLauncherInfo, () => getLauncherInfo())
  handle(IPC.openExternal, (url: string) => openExternal(url))
  handle(IPC.offlineUuid, (name: string) => offlineUuid(name.trim().slice(0, 16) || 'Steve'))
  handle(IPC.verifyProfile, (id: string, repair?: boolean) =>
    runTaskAndWait({
      label: repair ? msg('Восстановление файлов') : msg('Проверка файлов'),
      phase: 'version',
      run: ({ signal, taskId }) => verifyProfile(id, repair, { signal, taskId })
    })
  )
  handle(IPC.repairProfile, (id: string) =>
    runTaskAndWait({
      label: msg('Восстановление файлов'),
      phase: 'version',
      run: ({ signal, taskId }) => repairProfile(id, { signal, taskId })
    })
  )

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
  handle(IPC.updateMod, (profileId: string, fileName: string, versionId: string) =>
    runTaskAndWait({
      label: msg('Обновление мода'),
      phase: 'mod',
      run: ({ signal, taskId }) => updateMod(profileId, fileName, versionId, { signal, taskId })
    })
  )
  handle(IPC.updateAllMods, (profileId: string) =>
    runTaskAndWait({
      label: msg('Обновление модов'),
      phase: 'mod',
      run: ({ signal, taskId }) => updateAllMods(profileId, { signal, taskId })
    })
  )
  handle(IPC.setModsEnabled, (profileId: string, fileNames: string[], enabled: boolean) =>
    setModsEnabled(profileId, fileNames, enabled))
  handle(IPC.exportModList, (profileId: string) => exportModList(profileId))
  handle(IPC.importModList, (profileId: string) => importModList(profileId))
  handle(IPC.analyzeMods, (profileId: string) => analyzeMods(profileId))

  // Local worlds
  handle(IPC.listWorlds, (profileId: string) => listWorlds(profileId))
  handle(IPC.importWorldFile, (profileId: string) => importWorldFile(profileId))
  handle(IPC.exportWorld, (profileId: string, dirName: string) => exportWorld(profileId, dirName))
  handle(IPC.copyWorld, (profileId: string, dirName: string, targetProfileId: string) =>
    copyWorld(profileId, dirName, targetProfileId))
  handle(IPC.renameWorld, (profileId: string, dirName: string, name: string) => renameWorld(profileId, dirName, name))
  handle(IPC.deleteWorld, (profileId: string, dirName: string) => deleteWorld(profileId, dirName))

  // Modrinth catalogs
  handle(IPC.searchCatalog, (query: Parameters<typeof searchCatalog>[0]) => searchCatalog(query))
  handle(IPC.installCatalogProject, (profileId: string, kind: Parameters<typeof installCatalogProject>[1], projectId: string) =>
    runTaskAndWait({
      label: msg('Установка {name}', { name: kind }),
      phase: kind === 'modpack' ? 'modpack' : 'mod',
      run: ({ signal, taskId }) => installCatalogProject(profileId, kind, projectId, { signal, taskId })
    })
  )

  // Logs and crash reports
  handle(IPC.getLogFiles, (profileId?: string) => getLogFiles(profileId))
  handle(IPC.readLogFile, (profileId: string | undefined, name: string) => readLogFile(profileId, name))
  handle(IPC.listCrashReports, (profileId?: string) => listCrashReports(profileId))
  handle(IPC.analyzeCrash, (profileId: string) => analyzeCrash(profileId))
  handle(IPC.importDroppedFile, (profileId: string, filePath: string) => importDroppedFile(profileId, filePath))

  // Import from other launchers
  handle(IPC.detectImportSources, () => detectImportSources())
  handle(IPC.importLauncherProfile, (candidate: Parameters<typeof importLauncherProfile>[0]) =>
    importLauncherProfile(candidate))

  handle(IPC.listTasks, () => listTasks())
  handle(IPC.cancelTask, (id: string) => cancelTask(id))
  handle(IPC.pauseTask, (id: string) => pauseTask(id))
  handle(IPC.resumeTask, (id: string) => resumeTask(id))
  handle(IPC.clearFinishedTasks, () => clearFinishedTasks())

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

  ipcMain.handle(IPC.openFolder, async (_event, kind: 'root' | 'instances' | 'mods' | 'screenshots' | 'logs' | 'saves' | 'datapacks') => {
    const profileId = getState().selectedProfileId
    const targets: Record<typeof kind, string> = {
      root: dirs.root,
      instances: dirs.instances,
      mods: modsDir(profileId),
      screenshots: screenshotsDir(profileId),
      logs: dirs.logs,
      saves: savesDir(profileId),
      datapacks: path.join(instanceDir(profileId), 'datapacks')
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
