export const IPC = {
  getState: 'app:getState',
  setState: 'app:setState',
  setAccount: 'app:setAccount',
  addAccount: 'account:add',
  loginMicrosoft: 'account:loginMicrosoft',
  refreshMicrosoft: 'account:refreshMicrosoft',
  logoutMicrosoft: 'account:logoutMicrosoft',
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
  launchIntoWorld: 'game:launchWorld',
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
  getProjectVersions: 'modrinth:getProjectVersions',
  installModpack: 'modpack:install',
  installModpackFilePath: 'modpack:installPath',
  installModpackFromModrinth: 'modpack:installModrinth',
  installModpackFromUrl: 'modpack:installUrl',
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
  downloadUpdate: 'app:downloadUpdate',
  installUpdate: 'app:installUpdate',
  getLauncherInfo: 'app:getLauncherInfo',
  exportSettings: 'settings:export',
  importSettings: 'settings:import',
  openExternal: 'app:openExternal',
  offlineUuid: 'app:offlineUuid',
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
  updateMod: 'mods:update',

  // Local worlds
  listWorlds: 'worlds:list',
  importWorldFile: 'worlds:importFile',
  exportWorld: 'worlds:export',
  copyWorld: 'worlds:copy',
  renameWorld: 'worlds:rename',
  deleteWorld: 'worlds:delete',

  // Modrinth catalogs
  searchCatalog: 'modrinth:searchCatalog',
  installCatalogProject: 'modrinth:installCatalog',

  // Bulk mod management
  setModsEnabled: 'mods:setEnabled',
  exportModList: 'mods:exportList',
  importModList: 'mods:importList',
  analyzeMods: 'mods:analyze',
  updateAllMods: 'mods:updateAll',

  // Log and crash diagnostics
  getLogFiles: 'logs:files',
  readLogFile: 'logs:readFile',
  listCrashReports: 'logs:crashes',

  // Import from other launchers
  detectImportSources: 'import:detect',
  importLauncherProfile: 'import:apply',

  // Crash diagnostics
  analyzeCrash: 'logs:analyzeCrash',

  // Dropping files onto an instance card
  importDroppedFile: 'profile:importDroppedFile',

  // Task center
  listTasks: 'tasks:list',
  cancelTask: 'tasks:cancel',
  pauseTask: 'tasks:pause',
  resumeTask: 'tasks:resume',
  clearFinishedTasks: 'tasks:clearFinished'
} as const

export const EVENTS = {
  progress: 'event:progress',
  progressDone: 'event:progressDone',
  log: 'event:log',
  gameStatus: 'event:gameStatus',
  toast: 'event:toast',
  tasks: 'event:tasks'
} as const
