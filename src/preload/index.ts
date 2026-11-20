import { contextBridge, ipcRenderer } from 'electron'
import { EVENTS, IPC } from '@shared/ipc'
import type { LauncherAPI } from '@shared/types'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: LauncherAPI = {
  isMock: false,
  getState: () => invoke(IPC.getState),
  setState: (patch) => invoke(IPC.setState, patch),
  setAccount: (name) => invoke(IPC.setAccount, name),
  addAccount: (name) => invoke(IPC.addAccount, name),
  selectAccount: (id) => invoke(IPC.selectAccount, id),
  renameAccount: (id, name) => invoke(IPC.renameAccount, id, name),
  deleteAccount: (id) => invoke(IPC.deleteAccount, id),
  confirmDeleteAccount: (id) => invoke(IPC.confirmDeleteAccount, id),
  createProfile: (profile) => invoke(IPC.createProfile, profile),
  updateProfile: (id, patch) => invoke(IPC.updateProfile, id, patch),
  deleteProfile: (id) => invoke(IPC.deleteProfile, id),
  confirmDeleteProfile: (id) => invoke(IPC.confirmDeleteProfile, id),
  getVersions: () => invoke(IPC.getVersions),
  installProfile: (id) => invoke(IPC.installProfile, id),
  launch: (id) => invoke(IPC.launch, id),
  stopGame: () => invoke(IPC.stopGame),
  getGameStatus: () => invoke(IPC.getGameStatus),
  listMods: (id) => invoke(IPC.listMods, id),
  installLocalMod: (id) => invoke(IPC.installLocalMod, id),
  installModFile: (id, sourcePath) => invoke(IPC.installModFile, id, sourcePath),
  toggleMod: (id, fileName) => invoke(IPC.toggleMod, id, fileName),
  deleteMod: (id, fileName) => invoke(IPC.deleteMod, id, fileName),
  searchMods: (query, gameVersion, loader, offset) => invoke(IPC.searchMods, query, gameVersion, loader, offset),
  installMod: (id, projectId) => invoke(IPC.installMod, id, projectId),
  searchModpacks: (query) => invoke(IPC.searchModpacks, query),
  searchWorlds: (query) => invoke(IPC.searchWorlds, query),
  getProjectDetails: (projectId) => invoke(IPC.getProjectDetails, projectId),
  installModpack: (id) => invoke(IPC.installModpack, id),
  installModpackFilePath: (id, filePath) => invoke(IPC.installModpackFilePath, id, filePath),
  installModpackFromModrinth: (id, projectId) => invoke(IPC.installModpackFromModrinth, id, projectId),
  installWorld: (id, projectId) => invoke(IPC.installWorld, id, projectId),
  listScreenshots: (profileId) => invoke(IPC.listScreenshots, profileId),
  deleteScreenshot: (profileId, fileName) => invoke(IPC.deleteScreenshot, profileId, fileName),
  windowAction: (action) => invoke(IPC.windowAction, action),
  getJavaInfo: () => invoke(IPC.getJavaInfo),
  detectJava: () => invoke(IPC.detectJava),
  ensureJava: (major, profileId, explicit) => invoke(IPC.ensureJava, major, profileId, explicit),
  openFolder: (kind) => invoke(IPC.openFolder, kind),
  getLogs: () => invoke(IPC.getLogs),
  clearLogs: () => invoke(IPC.clearLogs),
  onProgress: (cb) => subscribe(EVENTS.progress, cb),
  onLog: (cb) => subscribe(EVENTS.log, cb),
  onGameStatus: (cb) => subscribe(EVENTS.gameStatus, cb),
  onToast: (cb) => subscribe(EVENTS.toast, cb),

  listSkins: () => invoke(IPC.listSkins),
  importSkin: () => invoke(IPC.importSkin),
  deleteSkin: (id) => invoke(IPC.deleteSkin, id),
  selectSkin: (id) => invoke(IPC.selectSkin, id),
  setSkinModel: (id, model) => invoke(IPC.setSkinModel, id, model),

  checkUpdates: () => invoke(IPC.checkUpdates),
  verifyProfile: (id, repair) => invoke(IPC.verifyProfile, id, repair),

  listBackups: (profileId) => invoke(IPC.listBackups, profileId),
  createBackup: (profileId) => invoke(IPC.createBackup, profileId),
  restoreBackup: (profileId, fileName) => invoke(IPC.restoreBackup, profileId, fileName),
  deleteBackup: (profileId, fileName) => invoke(IPC.deleteBackup, profileId, fileName),
  backupAllProfiles: () => invoke(IPC.backupAllProfiles),
  exportProfiles: (profileIds) => invoke(IPC.exportProfiles, profileIds),
  importProfiles: () => invoke(IPC.importProfiles),

  listPacks: (profileId, kind) => invoke(IPC.listPacks, profileId, kind),
  installPack: (profileId, kind) => invoke(IPC.installPack, profileId, kind),
  togglePack: (profileId, kind, fileName, enabled) => invoke(IPC.togglePack, profileId, kind, fileName, enabled),
  deletePack: (profileId, kind, fileName) => invoke(IPC.deletePack, profileId, kind, fileName),

  checkModUpdates: (profileId) => invoke(IPC.checkModUpdates, profileId),
  updateMod: (profileId, fileName, versionId) => invoke(IPC.updateMod, profileId, fileName, versionId)
}

contextBridge.exposeInMainWorld('launcher', api)
