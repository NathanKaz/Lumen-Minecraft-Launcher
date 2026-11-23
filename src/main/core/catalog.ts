import path from 'node:path'
import fs from 'fs-extra'
import { msg } from './i18n'
import { instanceDir, packsDir } from './paths'
import { fetchJson } from './http'
import { downloadMany } from './downloader'
import { emitProgress, emitToast } from './events'
import { getState } from './store'
import { installModpackFromModrinth } from './modpacks'
import { setPackEnabled } from './skins'
import type { CatalogKind, CatalogQuery, ModrinthProject } from '@shared/types'

const API = 'https://api.modrinth.com/v2'

interface CatalogFile {
  url: string
  filename: string
  size: number
  primary: boolean
  hashes?: { sha1?: string }
}

interface CatalogVersion {
  files: CatalogFile[]
}

function safeFileName(value: string): string {
  return path.basename(value).replace(/[^a-zA-Z0-9а-яА-ЯёЁ_\-. ]/g, '_').slice(0, 120) || 'pack.zip'
}

/** Searches one of the supported Modrinth catalogs with optional compatibility filters. */
export async function searchCatalog(query: CatalogQuery): Promise<ModrinthProject[]> {
  const facets: string[][] = [[`project_type:${query.kind}`]]
  if (query.category) facets.push([`categories:${query.category}`])
  if (query.loader && query.loader !== 'vanilla' && query.kind !== 'shader') {
    facets.push([`categories:${query.loader}`])
  }
  if (query.gameVersion) facets.push([`versions:${query.gameVersion}`])

  const params = new URLSearchParams({
    query: query.query,
    limit: '18',
    offset: String(Math.max(0, query.offset ?? 0)),
    index: query.query.trim() ? 'relevance' : 'downloads',
    facets: JSON.stringify(facets)
  })
  try {
    const result = await fetchJson<{ hits: ModrinthProject[] }>(`${API}/search?${params}`)
    return result.hits
  } catch {
    // Too many facets can fail on older proxies; retry with the bare type filter.
    try {
      const fallback = new URLSearchParams({
        query: query.query,
        limit: '18',
        offset: String(Math.max(0, query.offset ?? 0)),
        index: query.query.trim() ? 'relevance' : 'downloads',
        facets: JSON.stringify([[`project_type:${query.kind}`]])
      })
      const result = await fetchJson<{ hits: ModrinthProject[] }>(`${API}/search?${fallback}`)
      return result.hits
    } catch {
      return []
    }
  }
}

async function latestVersion(projectId: string, versionId?: string): Promise<CatalogVersion | undefined> {
  if (versionId) {
    return fetchJson<CatalogVersion>(`${API}/version/${encodeURIComponent(versionId)}`)
  }
  const versions = await fetchJson<CatalogVersion[]>(`${API}/project/${encodeURIComponent(projectId)}/version`)
  return versions.find((version) => version.files.length) ?? versions[0]
}

function pickFile(version: CatalogVersion | undefined): CatalogFile | undefined {
  if (!version) return undefined
  return version.files.find((file) => file.primary && /\.zip$/i.test(file.filename))
    ?? version.files.find((file) => /\.zip$/i.test(file.filename))
    ?? version.files[0]
}

async function downloadPack(
  profileId: string,
  projectId: string,
  kind: CatalogKind,
  targetDir: string,
  label: string,
  opts?: { signal?: AbortSignal; taskId?: string },
  versionId?: string
): Promise<void> {
  const version = await latestVersion(projectId, versionId)
  const file = pickFile(version)
  if (!file) throw new Error(msg('У проекта нет файла для установки'))

  const destination = path.join(targetDir, safeFileName(file.filename))
  await fs.ensureDir(targetDir)
  emitProgress({
    phase: 'mod',
    message: msg('Установка {name}', { name: label }),
    percent: 0,
    current: 0,
    total: 1,
    bytes: 0,
    totalBytes: 0,
    speed: 0,
    taskId: opts?.taskId
  })
  await downloadMany(
    [{ url: file.url, dest: destination, sha1: file.hashes?.sha1, size: file.size, label: file.filename }],
    'mod',
    label,
    1,
    opts
  )
  if (kind === 'resourcepack' || kind === 'shader') {
    await setPackEnabled(profileId, kind === 'resourcepack' ? 'resource' : 'shader', path.basename(destination), true)
  }
}

/** Installs a Modrinth project: modpacks become new instances, other content goes into the given one. */
export async function installCatalogProject(
  profileId: string,
  kind: CatalogKind,
  projectId: string,
  opts?: { signal?: AbortSignal; taskId?: string },
  versionId?: string
): Promise<void> {
  if (kind === 'modpack') {
    await installModpackFromModrinth(projectId, opts)
    return
  }

  const profile = getState().profiles.find((entry) => entry.id === profileId)
  if (!profile) throw new Error(msg('Сборка не найдена'))

  if (kind === 'datapack') {
    await downloadPack(profileId, projectId, kind, path.join(instanceDir(profileId), 'datapacks'), msg('Набор данных'), opts, versionId)
    emitToast('success', msg('Набор данных установлен'))
    return
  }

  const dir = packsDir(profileId, kind === 'resourcepack' ? 'resource' : 'shader')
  await downloadPack(profileId, projectId, kind, dir, msg(kind === 'resourcepack' ? 'Набор ресурсов' : 'Шейдеры'), opts, versionId)
  emitToast('success', msg(kind === 'resourcepack' ? 'Набор ресурсов установлен' : 'Набор шейдеров установлен'))
}
