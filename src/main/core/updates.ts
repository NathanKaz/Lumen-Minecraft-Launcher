import path from 'node:path'
import { spawn } from 'node:child_process'
import { app, shell } from 'electron'
import fs from 'fs-extra'
import { fetchJson } from './http'
import { getState } from './store'
import { dirs } from './paths'
import { downloadToFile } from './downloader'
import { emitLog, emitToast } from './events'
import { msg } from './i18n'
import { runTaskAndWait } from './tasks'
import { APP_LICENSE, APP_REPOSITORY, APP_VERSION } from '@shared/version'
import type { LauncherAsset, LauncherInfo, UpdateDownload, UpdateInfo } from '@shared/types'

const CURRENT_VERSION = APP_VERSION
const REPOSITORY = APP_REPOSITORY
const RELEASES_API = 'https://api.github.com/repos/NathanKaz/Lumen-Minecraft-Launcher/releases/latest'
const RELEASES_PAGE = `${REPOSITORY}/releases/latest`

interface GithubAsset {
  name: string
  browser_download_url: string
  size?: number
  digest?: string | null
}

interface GithubRelease {
  tag_name: string
  html_url: string
  body?: string | null
  published_at?: string
  assets?: GithubAsset[]
}

function normalize(version: string): string {
  return version.replace(/^v/i, '').trim()
}

function isNewer(latest: string, current: string): boolean {
  const a = normalize(latest).split(/[.\-+]/).map((part) => Number.parseInt(part, 10) || 0)
  const b = normalize(current).split(/[.\-+]/).map((part) => Number.parseInt(part, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left > right) return true
    if (left < right) return false
  }
  return false
}

function installMethod(name: string): LauncherAsset['method'] {
  if (/\.appimage$/i.test(name)) return 'appimage'
  if (/\.exe$/i.test(name)) return 'installer'
  return 'manual'
}

function sha256FromDigest(digest?: string | null): string | undefined {
  const match = /^sha256:([a-f0-9]{64})$/i.exec(digest ?? '')
  return match?.[1]
}

/**
 * Picks the artifact produced for this OS and CPU by electron-builder.
 * Builds from older releases without an arch suffix are accepted as a fallback.
 */
function pickAsset(release: GithubRelease, version: string): LauncherAsset | undefined {
  const assets = release.assets ?? []
  const platform = process.platform
  const arch = process.arch
  const matchesVersion = (asset: GithubAsset): boolean =>
    !version || asset.name.toLowerCase().includes(normalize(version).toLowerCase())

  const extension = platform === 'win32' ? /\.exe$/i : platform === 'darwin' ? /\.dmg$/i : /\.(appimage|deb)$/i
  const candidates = assets.filter((asset) => extension.test(asset.name) && matchesVersion(asset))

  const archMatch = candidates.find((asset) => asset.name.toLowerCase().includes(`-${arch}.`))
  if (platform === 'linux') {
    const preferred = archMatch ?? candidates.find((asset) => /\.appimage$/i.test(asset.name)) ?? candidates[0]
    return preferred ? toAsset(preferred) : undefined
  }
  return toAsset(archMatch ?? candidates[0])
}

function toAsset(asset: GithubAsset): LauncherAsset {
  return {
    name: asset.name,
    url: asset.browser_download_url,
    size: asset.size ?? 0,
    sha256: sha256FromDigest(asset.digest),
    method: installMethod(asset.name)
  }
}

export async function checkUpdates(): Promise<UpdateInfo> {
  let release: GithubRelease | null = null
  try {
    release = await fetchJson<GithubRelease>(RELEASES_API)
  } catch {
    // Network errors simply mean the launcher cannot check for updates right now.
  }

  const latestVersion = normalize(release?.tag_name || CURRENT_VERSION)
  const asset = release ? pickAsset(release, latestVersion) : undefined
  return {
    currentVersion: CURRENT_VERSION,
    latestVersion,
    url: release?.html_url || RELEASES_PAGE,
    updateAvailable: isNewer(latestVersion, CURRENT_VERSION),
    releaseNotes: release?.body ?? undefined,
    publishedAt: release?.published_at,
    asset
  }
}

/** Downloads the release asset into the launcher cache with task progress. */
export async function downloadUpdate(): Promise<UpdateDownload> {
  const info = await checkUpdates()
  if (!info.updateAvailable || !info.asset) {
    throw new Error(msg('Для этой платформы нет доступного обновления.'))
  }
  const asset = info.asset
  const dest = path.join(dirs.installers, path.basename(asset.name))
  const label = msg('Обновление лаунчера {version}', { version: info.latestVersion })

  await runTaskAndWait({
    label,
    phase: 'update',
    run: ({ signal, taskId }) => downloadToFile(
      asset.url,
      dest,
      'update',
      label,
      undefined,
      { signal, taskId },
      asset.sha256
    )
  })

  emitToast('success', msg('Обновление загружено: {name}', { name: asset.name }))
  return {
    version: info.latestVersion,
    fileName: asset.name,
    filePath: dest,
    size: (await fs.stat(dest)).size,
    method: asset.method
  }
}

/** Applies a downloaded update or opens it when the OS requires manual steps. */
export async function installUpdate(download: UpdateDownload): Promise<void> {
  if (!download.filePath) throw new Error(msg('Сначала скачайте обновление.'))
  if (!fs.existsSync(download.filePath)) throw new Error(msg('Файл обновления не найден. Скачайте его снова.'))

  if (download.method === 'manual') {
    // DEB packages need root and DMG images need a drag into Applications.
    if (/\.dmg$/i.test(download.fileName)) await shell.openPath(download.filePath)
    else await shell.openPath(path.dirname(download.filePath))
    emitToast('info', msg('Установщик открыт. Завершите установку и перезапустите лаунчер.'))
    return
  }

  if (!app.isPackaged) {
    throw new Error(msg('Установка обновлений доступна только в собранной версии лаунчера.'))
  }

  if (download.method === 'appimage') {
    try {
      await fs.chmod(download.filePath, 0o755)
    } catch (error) {
      throw new Error(msg('Не удалось запустить обновление: {error}', { error: (error as Error).message }))
    }
  }

  if (download.method === 'installer') {
    const child = spawn(download.filePath, [
      '/SILENT', '/CLOSEAPPLICATIONS', '/RESTARTAPPLICATIONS', '/NOCANCEL'
    ], { detached: true, stdio: 'ignore' })
    child.on('error', (error) => emitLog('error', msg('Не удалось запустить установщик: {error}', { error: error.message })))
    child.unref()
  } else {
    // The new AppImage must start after this process releases the single-instance lock.
    const child = spawn('/bin/sh', ['-c', 'sleep 2; exec "$1"', 'sh', download.filePath], {
      detached: true,
      stdio: 'ignore',
      env: process.env
    })
    child.on('error', (error) => emitLog('error', msg('Не удалось запустить обновление: {error}', { error: error.message })))
    child.unref()
  }

  emitToast('info', msg('Установка обновления... Лаунчер будет перезапущен.'))
  setTimeout(() => app.quit(), 800)
}

/** Opens external links only over http(s), never local or protocol-handler URLs. */
export async function openExternal(url: string): Promise<void> {
  const target = new URL(url)
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    throw new Error(msg('Разрешены только ссылки http и https.'))
  }
  await shell.openExternal(target.toString())
}

export async function getLauncherInfo(): Promise<LauncherInfo> {
  return {
    name: 'Lumen Launcher',
    version: CURRENT_VERSION,
    license: APP_LICENSE,
    author: 'NathanKaz',
    repository: REPOSITORY,
    homepage: REPOSITORY,
    electron: process.versions.electron ?? '—',
    chrome: process.versions.chrome ?? '—',
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    dataDir: dirs.root,
    packaged: app.isPackaged
  }
}

export async function openReleasesPage(): Promise<void> {
  const info = await checkUpdates()
  await shell.openExternal(info.url)
}

export function shouldCheckOnStartup(): boolean {
  return getState()?.settings.checkUpdates ?? false
}

export function launcherVersion(): string {
  return CURRENT_VERSION
}
