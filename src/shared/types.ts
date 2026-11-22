export type LoaderType = 'vanilla' | 'fabric' | 'forge' | 'neoforge'

export interface BuildGroup {
  id: string
  name: string
  color?: string
}

export interface Profile {
  id: string
  name: string
  versionId: string
  loader: LoaderType
  loaderVersionId?: string
  /** Individual RAM override. When absent, Settings.memory is used. */
  memory?: number
  groupId?: string
  /** Per-instance Java executable. Overrides Settings.javaPath. */
  javaPath?: string
  /** Extra JVM flags appended before the main class (quotes are supported). */
  jvmArgs?: string
  createdAt: number
  lastPlayed?: number
  playtimeMinutes: number
  /** Filesystem folder name derived from the display name; legacy builds omit it. */
  dirName?: string
  modpack?: {
    name: string
    version: string
    icon?: string
    source: 'mrpack' | 'manual'
  }
}

export interface Settings {
  javaPath: string
  memory: number
  width: number
  height: number
  fullscreen: boolean
  language: 'ru' | 'en'
  closeBehavior: 'exit' | 'tray'
  checkUpdates: boolean
  instancesView: 'grid' | 'list'
  /** Id of the skin from the library applied to every offline instance. */
  activeSkinId?: string
  /** Create a world backup before mod/version updates when saves exist. */
  autoBackupBeforeUpdates?: boolean
  /** Download a managed JRE when no compatible Java is installed. */
  autoInstallJava?: boolean
  /** Periodic world backups. Disabled by default. */
  scheduledBackup?: ScheduledBackupSettings
  /** Set after the first-run wizard is finished. */
  onboardingCompleted?: boolean
  /** Azure application (client) ID used for the Microsoft sign-in flow. */
  msaClientId?: string
}

export interface ScheduledBackupSettings {
  enabled: boolean
  intervalHours: number
  keepCount: number
}

export interface Account {
  id: string
  name: string
  uuid: string
  /** Minecraft access token used in the `auth_access_token` launch argument. */
  token: string
  type: 'offline' | 'microsoft'
  createdAt: number
  /** Expiry time of the Minecraft access token (Microsoft accounts only). */
  expiresAt?: number
  /** Xbox user ID, passed to the game as `auth_xuid`. */
  xuid?: string
  /** Xbox user hash used to build the Minecraft identity token. */
  userHash?: string
}

/** Data returned by the Microsoft → Xbox → Minecraft authentication chain. */
export interface MicrosoftCredentials {
  name: string
  uuid: string
  token: string
  expiresAt: number
  refreshToken: string
  xuid?: string
  userHash?: string
}

/** A fully isolated offline player: its own builds, groups and active skin. */
export interface AccountRecord extends Account {
  profiles: Profile[]
  groups: BuildGroup[]
  selectedProfileId: string
  activeSkinId?: string
  /** Filesystem folder name derived from the player name; legacy records omit it. */
  dirName?: string
}

export interface AppState {
  /** Bumped when a one-time state migration is required. */
  schemaVersion: number
  /** Top-level fields mirror the currently selected account for simpler consumers. */
  profiles: Profile[]
  groups: BuildGroup[]
  selectedProfileId: string
  settings: Settings
  account: Account
  accounts: AccountRecord[]
  activeAccountId: string
  installedVersions: string[]
}

export interface VersionSummary {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  released: string
  url: string
}

export interface VersionManifest {
  latest: { release: string; snapshot: string }
  versions: VersionSummary[]
}

export type ProgressPhase =
  | 'version'
  | 'libraries'
  | 'assets'
  | 'loader'
  | 'mod'
  | 'modpack'
  | 'world'
  | 'launch'
  | 'java'
  | 'update'

export interface ProgressPayload {
  phase: ProgressPhase
  message: string
  percent: number
  current: number
  total: number
  bytes: number
  totalBytes: number
  speed: number
  taskId?: string
}

export type TaskStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'canceled'

export interface TaskInfo {
  id: string
  label: string
  phase: ProgressPhase
  status: TaskStatus
  progress: ProgressPayload | null
  error?: string
  createdAt: number
  updatedAt: number
  canPause: boolean
  canCancel: boolean
  canRetry: boolean
}

export interface LogPayload {
  level: 'info' | 'warn' | 'error' | 'game'
  message: string
  time: number
}

export type GameStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'crashed'

export interface ToastPayload {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

export interface ModInfo {
  fileName: string
  name: string
  version: string
  description?: string
  icon?: string
  loader: string
  enabled: boolean
  size: number
  source?: string
}

export interface ModrinthProject {
  project_id: string
  slug: string
  title: string
  description: string
  icon_url?: string | null
  downloads: number
  /** Some API responses use `followers` instead of `follow_count`. */
  follow_count?: number
  followers?: number
  categories: string[]
  project_type?: string
  client_side?: string
  server_side?: string
  versions?: string[]
}

export interface ModrinthGalleryImage {
  url: string
  featured?: boolean
  title?: string | null
  description?: string | null
  ordering?: number
}

export interface ModrinthProjectDetails extends ModrinthProject {
  body?: string
  gallery?: ModrinthGalleryImage[]
  issues_url?: string | null
  source_url?: string | null
  wiki_url?: string | null
  discord_url?: string | null
  game_versions?: string[]
  loaders?: string[]
  published?: string
  updated?: string
}

export interface ModpackInfo {
  id: string
  name: string
  version: string
  gameVersion: string
  modCount: number
  installedAt: number
}

export interface ScreenshotInfo {
  fileName: string
  profileId: string
  profileName: string
  name: string
  size: number
  createdAt: number
  /** Inline image data so it works both in Electron and in the browser demo. */
  dataUrl: string
}

export interface JavaInfo {
  path: string
  version: string
  major: number
  valid: boolean
}

export type SkinModel = 'wide' | 'slim'

export interface SkinInfo {
  id: string
  name: string
  model: SkinModel
  /** Inline PNG data URL for the preview. */
  dataUrl: string
  size: number
  addedAt: number
  active: boolean
}

/** A downloadable GitHub release asset suitable for the current platform. */
export interface LauncherAsset {
  name: string
  url: string
  size: number
  /** GitHub's `sha256:` digest, when provided by the release. */
  sha256?: string
  /** How the launcher can apply this asset after downloading. */
  method: 'installer' | 'appimage' | 'manual'
}

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  url: string
  updateAvailable: boolean
  releaseNotes?: string
  publishedAt?: string
  /** Undefined when this platform has no supported artifact in the release. */
  asset?: LauncherAsset
}

/** Result of a completed in-app launcher update download. */
export interface UpdateDownload {
  version: string
  fileName: string
  filePath: string
  size: number
  method: LauncherAsset['method']
}

/** Static and runtime information shown in the About section. */
export interface LauncherInfo {
  name: string
  version: string
  license: string
  author: string
  repository: string
  homepage: string
  electron: string
  chrome: string
  node: string
  platform: string
  arch: string
  dataDir: string
  packaged: boolean
}

export interface VerifyReport {
  profileId: string
  checked: number
  missing: string[]
  invalid: string[]
  ok: boolean
}

export interface BackupInfo {
  fileName: string
  name: string
  size: number
  createdAt: number
}

export type PackKind = 'resource' | 'shader'

export interface PackInfo {
  fileName: string
  name: string
  kind: PackKind
  enabled: boolean
  size: number
}

export interface ModUpdateInfo {
  fileName: string
  name: string
  currentVersion: string
  latestVersion: string
  projectId: string
}

/** A single save folder shown in the local worlds tab. */
export interface WorldInfo {
  dirName: string
  name: string
  version: string
  lastPlayed?: number
  size: number
  modifiedAt: number
  iconUrl?: string
}

/** Modrinth project types the launcher can install into an instance. */
export type CatalogKind = 'modpack' | 'datapack' | 'resourcepack' | 'shader'

export interface CatalogQuery {
  kind: CatalogKind
  query: string
  gameVersion?: string
  loader?: string
  category?: string
  offset?: number
}

export type ModIssueType = 'duplicate' | 'loader' | 'version' | 'unknown' | 'disabled'

export interface ModIssue {
  fileName: string
  type: ModIssueType
  message: string
}

export interface ModListEntry {
  projectId: string
  versionId?: string
  fileName: string
  name: string
}

export interface UpdateAllResult {
  updated: string[]
  failed: string[]
}

export interface LogFileInfo {
  name: string
  size: number
  modifiedAt: number
}

export interface LogFileContent {
  name: string
  text: string
}

export interface CrashReportInfo extends LogFileInfo {
  text: string
}

export type ImportSource = 'official' | 'multimc' | 'curseforge'

export interface ImportCandidate {
  /** Opaque id unique for one detection pass. */
  id: string
  source: ImportSource
  /** Folder or archive to import from. */
  path: string
  name: string
  versionId: string
  loader: LoaderType
  loaderVersionId?: string
  details?: string
}

export interface ImportResult {
  imported: string[]
  skipped: string[]
}

/** Result of analyzing logs and crash reports after a game crash. */
export type CrashCause = 'memory' | 'java' | 'mod' | 'version' | 'unknown'

export type CrashAction =
  | 'increaseMemory'
  | 'installJava'
  | 'openMods'
  | 'verifyFiles'
  | 'openReport'
  | 'openSettings'

export interface CrashSuggestion {
  id: string
  title: string
  description: string
  action: CrashAction
}

export interface CrashAnalysis {
  profileId: string
  detected: boolean
  cause: CrashCause
  summary: string
  /** Short excerpts of the crash report/logs that led to the conclusion. */
  details: string[]
  reportName?: string
  reportText?: string
  suggestions: CrashSuggestion[]
}

export interface LauncherAPI {
  getState(): Promise<AppState>
  setState(patch: Partial<AppState>): Promise<AppState>
  /** Renames the active offline account (kept for backward compatibility). */
  setAccount(name: string): Promise<AppState>
  addAccount(name: string): Promise<AppState>
  /** Runs the Microsoft (MSA → Xbox → Minecraft) sign-in flow and adds the account. */
  loginMicrosoft(): Promise<AppState>
  /** Silently refreshes the Minecraft token of a Microsoft account. */
  refreshMicrosoft(id: string): Promise<AppState>
  /** Signs out: drops the stored refresh token and turns the profile offline. */
  logoutMicrosoft(id: string): Promise<AppState>
  selectAccount(id: string): Promise<AppState>
  renameAccount(id: string, name: string): Promise<AppState>
  deleteAccount(id: string): Promise<AppState>
  confirmDeleteAccount(id: string): Promise<boolean>
  createProfile(profile: Profile): Promise<AppState>
  updateProfile(id: string, patch: Partial<Profile>): Promise<AppState>
  deleteProfile(id: string): Promise<AppState>
  getVersions(): Promise<VersionManifest>
  installProfile(id: string): Promise<void>
  launch(id: string): Promise<void>
  stopGame(): Promise<void>
  getGameStatus(): Promise<GameStatus>
  listMods(profileId: string): Promise<ModInfo[]>
  installLocalMod(profileId: string): Promise<void>
  installModFile(profileId: string, path: string): Promise<void>
  toggleMod(profileId: string, fileName: string): Promise<void>
  deleteMod(profileId: string, fileName: string): Promise<void>
  searchMods(query: string, gameVersion?: string, loader?: string, offset?: number): Promise<ModrinthProject[]>
  installMod(profileId: string, projectId: string): Promise<void>
  searchModpacks(query: string): Promise<ModrinthProject[]>
  searchWorlds(query: string): Promise<ModrinthProject[]>
  getProjectDetails(projectId: string): Promise<ModrinthProjectDetails>
  installModpack(profileId: string): Promise<void>
  installModpackFilePath(profileId: string, filePath: string): Promise<void>
  installModpackFromModrinth(profileId: string, projectId: string): Promise<void>
  installWorld(profileId: string, projectId: string): Promise<void>
  listScreenshots(profileId?: string): Promise<ScreenshotInfo[]>
  deleteScreenshot(profileId: string, fileName: string): Promise<void>
  /** Native confirmation dialog. Resolves true only when the user confirms deletion. */
  confirmDeleteProfile(profileId: string): Promise<boolean>
  windowAction(action: 'minimize' | 'maximize' | 'close'): Promise<void>
  getJavaInfo(): Promise<JavaInfo>
  detectJava(): Promise<JavaInfo>
  /** Finds (or downloads) a Java runtime compatible with a Minecraft version. */
  ensureJava(major?: number, profileId?: string, explicit?: boolean): Promise<JavaInfo>
  /** Exports whole instances to a user-selected ZIP archive. */
  exportProfiles(profileIds: string[]): Promise<string | null>
  /** Imports instances from a user-selected archive. Returns the count. */
  importProfiles(): Promise<number>
  /** Creates world backups for every instance that has saves. Returns the count. */
  backupAllProfiles(): Promise<number>
  openFolder(kind: 'root' | 'instances' | 'mods' | 'screenshots' | 'logs' | 'saves' | 'datapacks'): Promise<void>
  getLogs(): Promise<LogPayload[]>
  clearLogs(): Promise<void>
  onProgress(cb: (payload: ProgressPayload) => void): () => void
  onLog(cb: (payload: LogPayload) => void): () => void
  onGameStatus(cb: (status: GameStatus) => void): () => void
  onToast(cb: (payload: ToastPayload) => void): () => void

  listSkins(): Promise<SkinInfo[]>
  importSkin(): Promise<SkinInfo | null>
  deleteSkin(id: string): Promise<void>
  selectSkin(id: string | null): Promise<void>
  setSkinModel(id: string, model: SkinModel): Promise<void>

  checkUpdates(): Promise<UpdateInfo>
  /** Downloads the matching release asset into the launcher cache. */
  downloadUpdate(): Promise<UpdateDownload>
  /** Applies a downloaded update; manual installs are opened for the user. */
  installUpdate(download: UpdateDownload): Promise<void>
  getLauncherInfo(): Promise<LauncherInfo>
  /** Opens an https link in the system browser. */
  openExternal(url: string): Promise<void>
  /** Deterministic offline-player UUID for the given nickname. */
  offlineUuid(name: string): Promise<string>
  verifyProfile(id: string, repair?: boolean): Promise<VerifyReport>

  listBackups(profileId: string): Promise<BackupInfo[]>
  createBackup(profileId: string): Promise<BackupInfo>
  restoreBackup(profileId: string, fileName: string): Promise<void>
  deleteBackup(profileId: string, fileName: string): Promise<void>

  listPacks(profileId: string, kind: PackKind): Promise<PackInfo[]>
  installPack(profileId: string, kind: PackKind): Promise<void>
  togglePack(profileId: string, kind: PackKind, fileName: string, enabled: boolean): Promise<void>
  deletePack(profileId: string, kind: PackKind, fileName: string): Promise<void>

  checkModUpdates(profileId: string): Promise<ModUpdateInfo[]>
  updateMod(profileId: string, fileName: string, versionId: string): Promise<void>

  // Local worlds
  listWorlds(profileId: string): Promise<WorldInfo[]>
  importWorldFile(profileId: string): Promise<void>
  exportWorld(profileId: string, dirName: string): Promise<void>
  copyWorld(profileId: string, dirName: string, targetProfileId: string): Promise<void>
  renameWorld(profileId: string, dirName: string, name: string): Promise<void>
  deleteWorld(profileId: string, dirName: string): Promise<void>

  // Modrinth catalogs (modpacks, datapacks, resource packs, shaders)
  searchCatalog(query: CatalogQuery): Promise<ModrinthProject[]>
  installCatalogProject(profileId: string, kind: CatalogKind, projectId: string): Promise<void>

  // Bulk mod management
  setModsEnabled(profileId: string, fileNames: string[], enabled: boolean): Promise<void>
  exportModList(profileId: string): Promise<void>
  importModList(profileId: string): Promise<void>
  analyzeMods(profileId: string): Promise<ModIssue[]>
  updateAllMods(profileId: string): Promise<UpdateAllResult>

  // Log and crash diagnostics
  getLogFiles(profileId?: string): Promise<LogFileInfo[]>
  readLogFile(profileId: string | undefined, name: string): Promise<LogFileContent>
  listCrashReports(profileId?: string): Promise<CrashReportInfo[]>

  // Importing instances from other launchers
  detectImportSources(): Promise<ImportCandidate[]>
  importLauncherProfile(candidate: ImportCandidate): Promise<boolean>

  // Crash diagnostics
  analyzeCrash(profileId: string): Promise<CrashAnalysis>

  /** Installs a file dropped onto an instance card (.jar, .mrpack, .zip, .mcworld). */
  importDroppedFile(profileId: string, filePath: string): Promise<void>

  listTasks(): Promise<TaskInfo[]>
  cancelTask(id: string): Promise<void>
  pauseTask(id: string): Promise<void>
  resumeTask(id: string): Promise<void>
  clearFinishedTasks(): Promise<void>
  onTasks(cb: (tasks: TaskInfo[]) => void): () => void

  isMock: boolean
}
