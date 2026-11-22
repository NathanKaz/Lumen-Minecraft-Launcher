import path from 'node:path'
import { msg } from './i18n'
import fs from 'fs-extra'
import { dirs, modsDir } from './paths'
import { downloadMany, type DownloadTask } from './downloader'
import { fetchJson } from './http'
import { emitProgress, emitToast } from './events'
import { getState } from './store'
import type { ModpackSort, ModrinthProject, ModrinthProjectDetails } from '@shared/types'

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

/**
 * Search the whole catalogue by default. Version/loader facets are applied only when the
 * user explicitly enables them in the UI, so builds never show an empty catalogue just
 * because a mod has no file for one exact Minecraft patch version.
 */
export async function searchMods(
  query: string,
  gameVersion?: string,
  loader?: string,
  offset = 0
): Promise<ModrinthProject[]> {
  const facets: string[][] = [['project_type:mod']]
  if (loader && loader !== 'vanilla') facets.push([`categories:${loader}`])
  if (gameVersion) facets.push([`versions:${gameVersion}`])
  const params = new URLSearchParams({
    query,
    limit: '24',
    offset: String(Math.max(0, offset)),
    index: 'relevance',
    facets: JSON.stringify(facets)
  })
  try {
    const result = await fetchJson<{ hits: ModrinthProject[] }>(`${API}/search?${params}`)
    return result.hits
  } catch {
    // The filtered request may fail on older proxies; fall back to the unfiltered index.
    const fallback = new URLSearchParams({
      query,
      limit: '24',
      offset: String(Math.max(0, offset)),
      index: 'relevance'
    })
    const result = await fetchJson<{ hits: ModrinthProject[] }>(`${API}/search?${fallback}`)
    return result.hits
  }
}

/** Modpack catalog with pagination and sorting so the first 18 hits are not the only visible packs. */
export async function searchModpacks(
  query: string,
  offset = 0,
  sort: ModpackSort = 'relevance'
): Promise<ModrinthProject[]> {
  const facets = JSON.stringify([['project_type:modpack']])
  const params = new URLSearchParams({
    query,
    limit: '24',
    offset: String(Math.max(0, offset)),
    index: sort,
    facets
  })
  try {
    const result = await fetchJson<{ hits: ModrinthProject[] }>(`${API}/search?${params}`)
    return result.hits
  } catch {
    // A proxy may reject the `index` value; retry with the universally supported index.
    const fallback = new URLSearchParams({
      query,
      limit: '24',
      offset: String(Math.max(0, offset)),
      index: 'downloads',
      facets
    })
    const result = await fetchJson<{ hits: ModrinthProject[] }>(`${API}/search?${fallback}`)
    return result.hits
  }
}

export async function getProjectDetails(projectId: string): Promise<ModrinthProjectDetails> {
  const project = await fetchJson<ModrinthProjectDetails>(`${API}/project/${encodeURIComponent(projectId)}`)
  if (project.follow_count == null && typeof project.followers === 'number') {
    project.follow_count = project.followers
  }
  if (Array.isArray(project.gallery)) {
    project.gallery = [...project.gallery].sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))
  }
  return project
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

function preferredVersion(versions: ModrinthVersion[]): ModrinthVersion {
  return versions.find((version) => !version.version_number.toLowerCase().includes('beta')) ?? versions[0]
}

async function resolveVersion(projectId: string, gameVersion: string, loader: string, versionId?: string): Promise<ModrinthVersion> {
  if (versionId) return versionById(versionId)
  const exact = await projectVersions(projectId, gameVersion, loader)
  if (exact.length) return preferredVersion(exact)

  // A mod may support the loader but not this exact patch version. Fall back to any
  // version for this loader (or, for vanilla, to the newest available release).
  const all = await projectVersions(projectId)
  if (!all.length) throw new Error(msg('Для проекта {id} нет доступных версий', { id: projectId }))
  const loaderMatches = loader !== 'vanilla' ? all.filter((version) => version.loaders.includes(loader)) : all
  if (loaderMatches.length) return preferredVersion(loaderMatches)
  return preferredVersion(all)
}

export async function installModrinthProject(
  profileId: string,
  projectId: string,
  versionId?: string,
  visited = new Set<string>(),
  opts?: { signal?: AbortSignal; taskId?: string }
): Promise<void> {
  const profile = getState().profiles.find((entry) => entry.id === profileId)
  if (!profile) throw new Error(msg("Сборка не найдена"))
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
    message: msg('Установка {name}', { name: version.name }),
    percent: 0,
    current: 0,
    total: tasks.length,
    bytes: 0,
    totalBytes: 0,
    speed: 0
  })
  await downloadMany(tasks, 'mod', msg('Мод {name}', { name: version.name }), 2, opts)

  for (const dependency of version.dependencies) {
    if (dependency.dependency_type !== 'required') continue
    if (!dependency.project_id && !dependency.version_id) continue
    await installModrinthProject(
      profileId,
      dependency.project_id ?? '',
      dependency.version_id,
      visited,
      opts
    )
  }
}

export async function installMod(profileId: string, projectId: string, opts?: { signal?: AbortSignal; taskId?: string }): Promise<void> {
  await installModrinthProject(profileId, projectId, undefined, new Set<string>(), opts)
  emitToast('success', msg("Мод установлен в выбранную сборку"))
}

export async function getModVersionsForMrpack(projectId: string) {
  return projectVersions(projectId)
}

/** All published versions of a project, used by the worlds installer. */
export async function getProjectVersions(projectId: string) {
  return projectVersions(projectId)
}
