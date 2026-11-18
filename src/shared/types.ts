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
  javaPath?: string
  createdAt: number
  lastPlayed?: number
  playtimeMinutes: number
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
}

export interface Account {
  name: string
  uuid: string
  token: string
  type: 'offline' | 'microsoft'
}

export interface AppState {
  /** Bumped when a one-time state migration is required. */
  schemaVersion: number
  profiles: Profile[]
  groups: BuildGroup[]
  selectedProfileId: string
  settings: Settings
  account: Account
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
  | 'launch'

export interface ProgressPayload {
  phase: ProgressPhase
  message: string
  percent: number
  current: number
  total: number
  bytes: number
  totalBytes: number
  speed: number
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
  follow_count: number
  categories: string[]
  project_type?: string
  client_side?: string
  server_side?: string
  versions?: string[]
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

export interface LauncherAPI {
  getState(): Promise<AppState>
  setState(patch: Partial<AppState>): Promise<AppState>
  setAccount(name: string): Promise<AppState>
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
  installModpack(profileId: string): Promise<void>
  installModpackFilePath(profileId: string, filePath: string): Promise<void>
  installModpackFromModrinth(profileId: string, projectId: string): Promise<void>
  listScreenshots(profileId?: string): Promise<ScreenshotInfo[]>
  deleteScreenshot(profileId: string, fileName: string): Promise<void>
  /** Native confirmation dialog. Resolves true only when the user confirms deletion. */
  confirmDeleteProfile(profileId: string): Promise<boolean>
  windowAction(action: 'minimize' | 'maximize' | 'close'): Promise<void>
  getJavaInfo(): Promise<JavaInfo>
  detectJava(): Promise<JavaInfo>
  openFolder(kind: 'root' | 'instances' | 'mods' | 'screenshots' | 'logs'): Promise<void>
  getLogs(): Promise<LogPayload[]>
  clearLogs(): Promise<void>
  onProgress(cb: (payload: ProgressPayload) => void): () => void
  onLog(cb: (payload: LogPayload) => void): () => void
  onGameStatus(cb: (status: GameStatus) => void): () => void
  onToast(cb: (payload: ToastPayload) => void): () => void
  isMock: boolean
}
