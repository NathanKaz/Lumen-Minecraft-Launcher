import path from 'node:path'
import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import { msg } from './i18n'
import { dirs, savesDir } from './paths'
import { downloadMany } from './downloader'
import { getProjectVersions } from './modrinth'
import { fetchJson } from './http'
import { emitToast, uid } from './events'
import { getState } from './store'
import type { ModrinthProject } from '@shared/types'

/** Search Modrinth's world catalogue. */
export async function searchWorlds(query: string): Promise<ModrinthProject[]> {
  const params = new URLSearchParams({
    query,
    limit: '18',
    index: 'downloads',
    facets: JSON.stringify([['project_type:world']])
  })
  try {
    const result = await fetchJson<{ hits: ModrinthProject[] }>(`https://api.modrinth.com/v2/search?${params}`)
    return result.hits
  } catch {
    return []
  }
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_\-. ]/g, '_').trim().slice(0, 60) || 'world'
}

async function uniqueDir(parent: string, base: string): Promise<string> {
  let candidate = path.join(parent, base)
  for (let index = 2; await fs.pathExists(candidate); index++) {
    candidate = path.join(parent, `${base}-${index}`)
  }
  return candidate
}

/** Downloads a Modrinth world and installs it into the active instance's `saves`. */
export async function installWorld(profileId: string, projectId: string): Promise<void> {
  const profile = getState().profiles.find((entry) => entry.id === profileId)
  if (!profile) throw new Error(msg("Сборка не найдена"))

  const versions = await getProjectVersions(projectId)
  const version = versions.find((entry) => !entry.version_number.toLowerCase().includes('beta')) ?? versions[0]
  const file = version?.files.find((entry) => entry.primary && /\.(zip|mcworld)$/i.test(entry.filename))
    ?? version?.files.find((entry) => /\.(zip|mcworld)$/i.test(entry.filename))
  if (!file) throw new Error(msg('У мира нет файла для установки'))

  const extension = path.extname(file.filename).toLowerCase() || '.zip'
  const archive = path.join(dirs.cache, `world-${uid()}${extension}`)
  await downloadMany(
    [{ url: file.url, dest: archive, sha1: file.hashes?.sha1, size: file.size, label: file.filename }],
    'world',
    msg('Скачивание мира'),
    1
  )

  const temp = path.join(dirs.cache, `world-extract-${uid()}`)
  await fs.ensureDir(temp)
  try {
    const zip = new AdmZip(archive)
    const entries = zip.getEntries()
    for (const entry of entries) {
      if (entry.entryName.split('/').includes('..')) throw new Error(msg('Архив мира содержит небезопасные пути'))
    }
    const levelEntries = entries
      .filter((entry) => /(^|\/)level\.dat$/i.test(entry.entryName))
      .sort((a, b) => a.entryName.split('/').length - b.entryName.split('/').length)
    if (!levelEntries.length) throw new Error(msg('Файл не содержит мир Minecraft (level.dat)'))

    // A world archive is either a bare `level.dat` at the root or a single
    // world folder containing it. Install whichever layout it uses as one save.
    const prefix = path.posix.dirname(levelEntries[0].entryName)
    const folder = !prefix || prefix === '.' || prefix === '/' ? '' : prefix
    zip.extractAllTo(temp, true)

    const source = folder ? path.join(temp, folder) : temp
    if (!(await fs.pathExists(path.join(source, 'level.dat')))) {
      throw new Error(msg('Не удалось найти мир в архиве'))
    }
    const saves = savesDir(profileId)
    await fs.ensureDir(saves)
    const fallback = file.filename.replace(/\.(zip|mcworld)$/i, '')
    const destination = await uniqueDir(saves, safeName(folder ? path.basename(folder) : fallback))
    await fs.copy(source, destination, { overwrite: true })
    emitToast('success', msg('Мир «{name}» установлен в сборку «{profile}»', {
      name: path.basename(destination),
      profile: profile.name
    }))
  } finally {
    await fs.remove(temp)
    await fs.remove(archive)
  }
}
