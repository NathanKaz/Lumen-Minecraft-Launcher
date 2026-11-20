export const IPC = {
  getState: 'app:getState',
  setState: 'app:setState',
  setAccount: 'app:setAccount',
  addAccount: 'account:add',
  selectAccount: 'account:select',
  renameAccount: 'account:rename',
  deleteAccount: 'account:delete',
  confirmDeleteAccount: 'account:confirmDelete',
  createProfile: 'profile:create',
  updateProfile: 'profile:update',
  deleteProfile: 'profile:delete',
  confirmDeleteProfile: 'profile:confirmDelete',
  getVersions: 'version:list',
  installProfile: 'profile:install',
  launch: 'game:launch',
  stopGame: 'game:stop',
  getGameStatus: 'game:status',
  listMods: 'mods:list',
  installLocalMod: 'mods:installLocal',
  installModFile: 'mods:installFile',
  toggleMod: 'mods:toggle',
  deleteMod: 'mods:delete',
  searchMods: 'modrinth:searchMods',
  installMod: 'modrinth:installMod',
  searchModpacks: 'modrinth:searchModpacks',
  searchWorlds: 'modrinth:searchWorlds',
  getProjectDetails: 'modrinth:getProject',
  installModpack: 'modpack:install',
  installModpackFilePath: 'modpack:installPath',
  installModpackFromModrinth: 'modpack:installModrinth',
  installWorld: 'world:install',
  listScreenshots: 'screenshots:list',
  deleteScreenshot: 'screenshots:delete',
  windowAction: 'app:windowAction',
  getJavaInfo: 'java:info',
  detectJava: 'java:detect',
  ensureJava: 'java:ensure',
  openFolder: 'app:openFolder',
  getLogs: 'logs:get',
  clearLogs: 'logs:clear',

  // Skins
  listSkins: 'skins:list',
  importSkin: 'skins:import',
  deleteSkin: 'skins:delete',
  selectSkin: 'skins:select',
  setSkinModel: 'skins:setModel',

  // Updates & verification
  checkUpdates: 'app:checkUpdates',
  verifyProfile: 'profile:verify',
  repairProfile: 'profile:repair',

  // Backups
  listBackups: 'backups:list',
  createBackup: 'backups:create',
  restoreBackup: 'backups:restore',
  deleteBackup: 'backups:delete',
  backupAllProfiles: 'backups:backupAll',

  // Instance transfer
  exportProfiles: 'profiles:export',
  importProfiles: 'profiles:import',

  // Resource/shader packs
  listPacks: 'packs:list',
  installPack: 'packs:install',
  togglePack: 'packs:toggle',
  deletePack: 'packs:delete',

  // Mod updates
  checkModUpdates: 'mods:checkUpdates',
  updateMod: 'mods:update'
} as const

export const EVENTS = {
  progress: 'event:progress',
  log: 'event:log',
  gameStatus: 'event:gameStatus',
  toast: 'event:toast'
} as const
