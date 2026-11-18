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
  createProfile: (profile) => invoke(IPC.createProfile, profile),
  updateProfile: (id, patch) => invoke(IPC.updateProfile, id, patch),
  deleteProfile: (id) => invoke(IPC.deleteProfile, id),
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
  searchMods: (query, gameVersion, loader) => invoke(IPC.searchMods, query, gameVersion, loader),
  installMod: (id, projectId) => invoke(IPC.installMod, id, projectId),
  searchModpacks: (query) => invoke(IPC.searchModpacks, query),
  installModpack: (id) => invoke(IPC.installModpack, id),
  installModpackFilePath: (id, filePath) => invoke(IPC.installModpackFilePath, id, filePath),
  installModpackFromModrinth: (id, projectId) => invoke(IPC.installModpackFromModrinth, id, projectId),
  windowAction: (action) => invoke(IPC.windowAction, action),
  getJavaInfo: () => invoke(IPC.getJavaInfo),
  detectJava: () => invoke(IPC.detectJava),
  openFolder: (kind) => invoke(IPC.openFolder, kind),
  getLogs: () => invoke(IPC.getLogs),
  clearLogs: () => invoke(IPC.clearLogs),
  onProgress: (cb) => subscribe(EVENTS.progress, cb),
  onLog: (cb) => subscribe(EVENTS.log, cb),
  onGameStatus: (cb) => subscribe(EVENTS.gameStatus, cb),
  onToast: (cb) => subscribe(EVENTS.toast, cb)
}

contextBridge.exposeInMainWorld('launcher', api)
