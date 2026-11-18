import path from 'node:path'
import fs from 'fs-extra'
import { instanceDir, screenshotsDir } from './paths'
import { getState } from './store'
import type { ScreenshotInfo } from '@shared/types'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])

const mimeTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp'
}

/** Screenshots are written by Minecraft into <instanceDir>/screenshots. */
export async function listScreenshots(profileId?: string): Promise<ScreenshotInfo[]> {
  const profiles = getState().profiles.filter((profile) => !profileId || profile.id === profileId)
  const result: ScreenshotInfo[] = []

  for (const profile of profiles) {
    const directory = screenshotsDir(profile.id)
    if (!(await fs.pathExists(directory))) continue
    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!IMAGE_EXTENSIONS.has(ext)) continue
      const fullPath = path.join(directory, entry.name)
      try {
        const [buffer, stat] = await Promise.all([fs.readFile(fullPath), fs.stat(fullPath)])
        result.push({
          fileName: entry.name,
          profileId: profile.id,
          profileName: profile.name,
          name: path.basename(entry.name, ext),
          size: stat.size,
          createdAt: stat.mtimeMs,
          dataUrl: `data:${mimeTypes[ext] ?? 'image/png'};base64,${buffer.toString('base64')}`
        })
      } catch {
        // Skip files that disappeared or cannot be read.
      }
    }
  }

  return result.sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteScreenshot(profileId: string, fileName: string): Promise<void> {
  const safeName = path.basename(fileName)
  if (safeName !== fileName) throw new Error('Недопустимое имя файла')
  const target = path.join(screenshotsDir(profileId), safeName)
  if (!(await fs.pathExists(target))) throw new Error('Скриншот не найден')
  await fs.remove(target)
}

/** Data used in the native deletion warning so the message matches what is actually removed. */
export async function deletionSummary(profileId: string): Promise<{ name: string; path: string; directories: string[] }> {
  const profile = getState().profiles.find((entry) => entry.id === profileId)
  if (!profile) throw new Error('Сборка не найдена')
  const directory = instanceDir(profileId)
  const known = ['saves', 'mods', 'screenshots', 'config', 'resourcepacks', 'shaderpacks', 'options.txt', 'options.profiles.json', 'logs', 'crash-reports']
  const present: string[] = []
  for (const name of known) {
    if (await fs.pathExists(path.join(directory, name))) present.push(name)
  }
  return { name: profile.name, path: directory, directories: present }
}
