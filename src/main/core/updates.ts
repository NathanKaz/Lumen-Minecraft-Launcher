import { shell } from 'electron'
import { fetchJson } from './http'
import { getState } from './store'
import { APP_VERSION } from '@shared/version'
import type { UpdateInfo } from '@shared/types'

const CURRENT_VERSION = APP_VERSION
const RELEASES_API = 'https://api.github.com/repos/NathanKaz/Lumen-Minecraft-Launcher/releases/latest'
const RELEASES_PAGE = 'https://github.com/NathanKaz/Lumen-Minecraft-Launcher/releases/latest'

interface GithubRelease {
  tag_name: string
  html_url: string
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

export async function checkUpdates(): Promise<UpdateInfo> {
  let latestVersion = CURRENT_VERSION
  let url = RELEASES_PAGE
  try {
    const release = await fetchJson<GithubRelease>(RELEASES_API)
    latestVersion = release.tag_name || CURRENT_VERSION
    url = release.html_url || RELEASES_PAGE
  } catch {
    // Network errors simply mean the launcher cannot check for updates right now.
  }
  return {
    currentVersion: CURRENT_VERSION,
    latestVersion: normalize(latestVersion),
    url,
    updateAvailable: isNewer(latestVersion, CURRENT_VERSION)
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
