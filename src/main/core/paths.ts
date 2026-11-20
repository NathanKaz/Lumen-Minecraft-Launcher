import { app } from 'electron'
import path from 'node:path'
import fs from 'fs-extra'

export const root = path.join(app.getPath('userData'), 'launcher')

export const dirs = {
  root,
  versions: path.join(root, 'versions'),
  libraries: path.join(root, 'libraries'),
  assets: path.join(root, 'assets'),
  instances: path.join(root, 'instances'),
  cache: path.join(root, 'cache'),
  logs: path.join(root, 'logs'),
  skins: path.join(root, 'skins'),
  backups: path.join(root, 'backups'),
  installers: path.join(root, 'cache', 'installers'),
  java: path.join(root, 'java'),
  javaCache: path.join(root, 'cache', 'java')
}

export function ensureDirs(): void {
  for (const dir of Object.values(dirs)) fs.ensureDirSync(dir)
}

/**
 * Display names are used as folder names, with characters that are unsafe on
 * Windows replaced. Cyrillic and spaces are kept so folders read like the UI.
 */
export function safeDirName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 80) || 'launcher'
}

// The store registers readable folder names; fall back to the old ID-based
// layout for anything created before mapping is initialised.
const profileDirNames = new Map<string, string>()
const accountDirNames = new Map<string, string>()

export function registerProfileDir(profileId: string, dirName: string): void {
  profileDirNames.set(profileId, dirName)
}

export function registerAccountDir(accountId: string, dirName: string): void {
  accountDirNames.set(accountId, dirName)
}

export function clearDirNames(): void {
  profileDirNames.clear()
  accountDirNames.clear()
}

export function profileDirName(profileId: string): string {
  return profileDirNames.get(profileId) ?? profileId
}

export function instanceDir(profileId: string): string {
  return path.join(dirs.instances, profileDirName(profileId))
}

export function modsDir(profileId: string): string {
  return path.join(instanceDir(profileId), 'mods')
}

export function screenshotsDir(profileId: string): string {
  return path.join(instanceDir(profileId), 'screenshots')
}

export function savesDir(profileId: string): string {
  return path.join(instanceDir(profileId), 'saves')
}

export function versionDir(versionId: string): string {
  return path.join(dirs.versions, versionId)
}

export function backupDir(profileId: string): string {
  return path.join(dirs.backups, profileDirName(profileId))
}

export function accountSkinDir(accountId: string): string {
  return path.join(dirs.skins, accountDirNames.get(accountId) ?? accountId)
}

export function packsDir(profileId: string, kind: 'resource' | 'shader'): string {
  return path.join(instanceDir(profileId), kind === 'resource' ? 'resourcepacks' : 'shaderpacks')
}
