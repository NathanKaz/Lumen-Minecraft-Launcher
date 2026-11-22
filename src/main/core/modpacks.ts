import path from 'node:path'
import crypto from 'node:crypto'
import { msg } from './i18n'
import { dialog } from 'electron'
import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import { dirs, instanceDir } from './paths'
import { downloadMany, type DownloadTask } from './downloader'
import { emitProgress, emitToast, uid } from './events'
import { createProfile, deleteProfile } from './store'
import { installProfile } from './versions'
import { defaultProfileName } from '@shared/naming'
import type { LoaderType, Profile } from '@shared/types'
import { getModVersionsForMrpack, getProjectDetails } from './modrinth'

interface MrpackIndex {
  name: string
  versionId: string
  summary?: string
  dependencies: Record<string, string>
  files: Array<{
    path: string
    downloads: string[]
    hashes?: { sha1?: string; sha512?: string }
    fileSize?: number
  }>
}

function detectLoader(dependencies: Record<string, string>): { loader: LoaderType; version?: string } {
  if (dependencies['fabric-loader']) return { loader: 'fabric', version: dependencies['fabric-loader'] }
  if (dependencies.neoforge) return { loader: 'neoforge', version: dependencies.neoforge }
  if (dependencies.forge) return { loader: 'forge', version: dependencies.forge }
  return { loader: 'vanilla' }
}

/** Installs a modpack as a separate instance so existing builds are never overwritten. */
async function installMrpack(file: string, opts?: { signal?: AbortSignal; taskId?: string }): Promise<void> {
  const zip = new AdmZip(file)
  const indexEntry = zip.getEntry('modrinth.index.json')
  if (!indexEntry) throw new Error(msg("Файл не является модпаком Modrinth (.mrpack)"))
  const index = JSON.parse(indexEntry.getData().toString('utf8')) as MrpackIndex

  const gameVersion = index.dependencies.minecraft || '1.20.1'
  const { loader, version: loaderVersion } = detectLoader(index.dependencies)
  const name = index.name?.trim() || defaultProfileName(gameVersion, loader)
  const profile: Profile = {
    id: crypto.randomUUID(),
    name,
    versionId: gameVersion,
    loader,
    createdAt: Date.now(),
    playtimeMinutes: 0,
    modpack: {
      name: index.name || path.basename(file, '.mrpack'),
      version: index.versionId || '1.0.0',
      source: 'mrpack'
    }
  }
  createProfile(profile)

  try {
    emitProgress({
      phase: 'modpack',
      message: msg('Установка модпака {name}', { name: index.name || name }),
      percent: 5,
      current: 0,
      total: index.files.length,
      bytes: 0,
      totalBytes: 0,
      speed: 0,
      taskId: opts?.taskId
    })
    await installProfile(profile.id, loaderVersion, true, opts)

    const directory = instanceDir(profile.id)
    await fs.ensureDir(directory)
    const tasks: DownloadTask[] = index.files
      .filter((entry) => entry.downloads.length > 0)
      .map((entry) => ({
        url: entry.downloads[0],
        dest: path.join(directory, entry.path),
        sha1: entry.hashes?.sha1,
        size: entry.fileSize,
        label: path.basename(entry.path)
      }))
    await downloadMany(tasks, 'modpack', msg('Модпак {name}', { name: index.name || name }), 3, opts)

    const temp = path.join(dirs.cache, `mrpack-${uid()}`)
    await fs.ensureDir(temp)
    try {
      zip.extractAllTo(temp, true)
      const overrides = path.join(temp, 'overrides')
      if (await fs.pathExists(overrides)) {
        await fs.copy(overrides, directory, { overwrite: true })
      }
    } finally {
      await fs.remove(temp)
    }
    emitToast('success', msg('Модпак «{name}» установлен в новую сборку', { name: index.name || name }))
  } catch (error) {
    // Do not leave a half-installed build behind if the download or install fails.
    await fs.remove(instanceDir(profile.id))
    deleteProfile(profile.id)
    throw error
  }
}

export async function installModpackFromFile(opts?: { signal?: AbortSignal; taskId?: string }): Promise<void> {
  const result = await dialog.showOpenDialog({
    title: msg("Выберите файл модпака"),
    filters: [
      { name: msg("Modrinth модпак"), extensions: ['mrpack', 'zip'] },
      { name: msg("Все файлы"), extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths[0]) return
  await installMrpack(result.filePaths[0], opts)
}

export async function installModpackFromPath(filePath: string, opts?: { signal?: AbortSignal; taskId?: string }): Promise<void> {
  await installMrpack(filePath, opts)
}

type ParsedModpackUrl =
  | { kind: 'modrinth'; id: string }
  | { kind: 'direct'; url: string }

/** Accepts Modrinth project links and direct .mrpack downloads; no arbitrary file paths. */
function parseModpackUrl(raw: string): ParsedModpackUrl {
  let target: URL
  try {
    target = new URL(raw.trim())
  } catch {
    throw new Error(msg('Введите ссылку на модпак Modrinth или прямую ссылку на файл .mrpack'))
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    throw new Error(msg('Поддерживаются только ссылки http и https'))
  }
  const host = target.hostname.replace(/^www\./, '')
  if (host === 'modrinth.com' || host === 'modrinth.net') {
    const segments = target.pathname.split('/').filter(Boolean)
    const index = segments.indexOf('modpack')
    const id = index >= 0 ? segments[index + 1] : undefined
    if (!id) throw new Error(msg('Ссылка должна вести на страницу модпака Modrinth (/modpack/...)'))
    return { kind: 'modrinth', id: decodeURIComponent(id) }
  }
  if (/\.mrpack$/i.test(target.pathname)) return { kind: 'direct', url: target.toString() }
  if (host.includes('curseforge.com')) {
    throw new Error(msg('Модпаки CurseForge пока устанавливаются только из файла .mrpack'))
  }
  throw new Error(msg('Неизвестный источник ссылки. Поддерживаются Modrinth и прямые ссылки на .mrpack'))
}

export async function installModpackFromUrl(rawUrl: string, opts?: { signal?: AbortSignal; taskId?: string }): Promise<void> {
  const parsed = parseModpackUrl(rawUrl)
  if (parsed.kind === 'modrinth') {
    const project = await getProjectDetails(parsed.id)
    if (project.project_type && project.project_type !== 'modpack') {
      throw new Error(msg('Этот проект Modrinth не является модпаком'))
    }
    await installModpackFromModrinth(parsed.id, opts)
    return
  }

  const fileName = decodeURIComponent(path.basename(new URL(parsed.url).pathname))
  const temp = path.join(dirs.cache, `mrpack-url-${uid()}-${path.basename(fileName, path.extname(fileName))}.mrpack`)
  await downloadMany(
    [{ url: parsed.url, dest: temp, size: 0, label: fileName }],
    'modpack',
    msg('Скачивание модпака'),
    1,
    opts
  )
  try {
    await installMrpack(temp, opts)
  } finally {
    await fs.remove(temp)
  }
}

export async function installModpackFromModrinth(projectId: string, opts?: { signal?: AbortSignal; taskId?: string }): Promise<void> {
  const versions = await getModVersionsForMrpack(projectId)
  const version = versions[0]
  const file = version?.files.find((entry) => entry.filename.endsWith('.mrpack')) ?? version?.files[0]
  if (!file) throw new Error(msg("У модпака нет файла для установки"))

  const temp = path.join(dirs.cache, `mrpack-download-${uid()}.mrpack`)
  await downloadMany(
    [{ url: file.url, dest: temp, sha1: file.hashes.sha1, size: file.size, label: file.filename }],
    'modpack',
    msg("Скачивание модпака"),
    1,
    opts
  )
  try {
    await installMrpack(temp, opts)
  } finally {
    await fs.remove(temp)
  }
}
