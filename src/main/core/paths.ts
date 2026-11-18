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
  installers: path.join(root, 'cache', 'installers')
}

export function ensureDirs(): void {
  for (const dir of Object.values(dirs)) fs.ensureDirSync(dir)
}

export function instanceDir(profileId: string): string {
  return path.join(dirs.instances, profileId)
}

export function modsDir(profileId: string): string {
  return path.join(instanceDir(profileId), 'mods')
}

export function versionDir(versionId: string): string {
  return path.join(dirs.versions, versionId)
}
