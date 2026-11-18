import path from 'node:path'
import fs from 'fs-extra'
import { dirs, modsDir } from './paths'
import { downloadMany, type DownloadTask } from './downloader'
import { fetchJson } from './http'
import { emitProgress, emitToast } from './events'
import { getState } from './store'
import type { ModrinthProject } from '@shared/types'

const API = 'https://api.modrinth.com/v2'

interface ModrinthFile {
  hashes: { sha1: string; sha512: string }
  url: string
  primary: boolean
  filename: string
  size: number
}

interface ModrinthDependency {
  project_id?: string
  version_id?: string
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded'
}

interface ModrinthVersion {
  id: string
  project_id: string
  version_number: string
  name: string
  game_versions: string[]
  loaders: string[]
  files: ModrinthFile[]
  dependencies: ModrinthDependency[]
}

export async function searchMods(query: string, gameVersion?: string, loader?: string): Promise<ModrinthProject[]> {
  const facets: string[][] = [['project_type:mod']]
  if (loader && loader !== 'vanilla') facets.push([`categories:${loader === 'neoforge' ? 'neoforge' : loader}`])
  if (gameVersion) facets.push([`versions:${gameVersion}`])
  const params = new URLSearchParams({
    query,
    limit: '24',
    index: 'relevance',
    facets: JSON.stringify(facets)
  })
  try {
    const result = await fetchJson<{ hits: ModrinthProject[] }>(`${API}/search?${params}`)
    return result.hits
  } catch {
    const fallback = new URLSearchParams({ query, limit: '24', index: 'relevance' })
    const result = await fetchJson<{ hits: ModrinthProject[] }>(`${API}/search?${fallback}`)
    return result.hits
  }
}

export async function searchModpacks(query: string): Promise<ModrinthProject[]> {
  const params = new URLSearchParams({ query, limit: '18', index: 'downloads', facets: JSON.stringify([['project_type:modpack']]) })
  try {
    const result = await fetchJson<{ hits: ModrinthProject[] }>(`${API}/search?${params}`)
    return result.hits
  } catch {
    return []
  }
}

async function projectVersions(projectId: string, gameVersion?: string, loader?: string): Promise<ModrinthVersion[]> {
  const params = new URLSearchParams()
  if (gameVersion) params.set('game_versions', JSON.stringify([gameVersion]))
  if (loader && loader !== 'vanilla') params.set('loaders', JSON.stringify([loader]))
  const query = params.toString()
  return fetchJson<ModrinthVersion[]>(`${API}/project/${encodeURIComponent(projectId)}/version${query ? `?${query}` : ''}`)
}

async function versionById(versionId: string): Promise<ModrinthVersion> {
  return fetchJson<ModrinthVersion>(`${API}/version/${encodeURIComponent(versionId)}`)
}

async function resolveVersion(projectId: string, gameVersion: string, loader: string, versionId?: string): Promise<ModrinthVersion> {
  if (versionId) return versionById(versionId)
  const versions = await projectVersions(projectId, gameVersion, loader)
  if (!versions.length) throw new Error(`Для проекта ${projectId} нет версии под Minecraft ${gameVersion} (${loader})`)
  return versions.find((version) => !version.version_number.toLowerCase().includes('beta')) ?? versions[0]
}

export async function installModrinthProject(
  profileId: string,
  projectId: string,
  versionId?: string,
  visited = new Set<string>()
): Promise<void> {
  const profile = getState().profiles.find((entry) => entry.id === profileId)
  if (!profile) throw new Error('Сборка не найдена')
  if (visited.has(`${projectId}:${versionId ?? ''}`)) return
  visited.add(`${projectId}:${versionId ?? ''}`)

  const version = await resolveVersion(projectId, profile.versionId, profile.loader, versionId)
  const target = modsDir(profileId)
  await fs.ensureDir(target)

  const tasks: DownloadTask[] = version.files
    .filter((file) => file.primary || version.files.length === 1)
    .map((file) => ({
      url: file.url,
      dest: path.join(target, file.filename),
      sha1: file.hashes.sha1,
      size: file.size,
      label: file.filename
    }))

  emitProgress({
    phase: 'mod',
    message: `Установка ${version.name}`,
    percent: 0,
    current: 0,
    total: tasks.length,
    bytes: 0,
    totalBytes: 0,
    speed: 0
  })
  await downloadMany(tasks, 'mod', `Мод ${version.name}`, 2)

  for (const dependency of version.dependencies) {
    if (dependency.dependency_type !== 'required') continue
    if (!dependency.project_id && !dependency.version_id) continue
    await installModrinthProject(
      profileId,
      dependency.project_id ?? '',
      dependency.version_id,
      visited
    )
  }
}

export async function installMod(profileId: string, projectId: string): Promise<void> {
  await installModrinthProject(profileId, projectId)
  emitToast('success', 'Мод установлен в выбранную сборку')
}

export async function getModVersionsForMrpack(projectId: string) {
  return projectVersions(projectId)
}
