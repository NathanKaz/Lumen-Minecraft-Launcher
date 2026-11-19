import path from 'node:path'
import { msg } from './i18n'
import { dialog } from 'electron'
import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import { dirs, instanceDir } from './paths'
import { downloadMany, type DownloadTask } from './downloader'
import { emitProgress, emitToast, uid } from './events'
import { getState, updateProfile } from './store'
import { installProfile } from './versions'
import { createAutoBackup } from './backups'
import type { LoaderType } from '@shared/types'
import { getModVersionsForMrpack } from './modrinth'

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

async function installMrpack(profileId: string, file: string): Promise<void> {
  const profile = getState().profiles.find((entry) => entry.id === profileId)
  if (!profile) throw new Error(msg("Сборка не найдена"))

  await createAutoBackup(profileId, msg('Автобэкап перед обновлением модпака'))

  const zip = new AdmZip(file)
  const indexEntry = zip.getEntry('modrinth.index.json')
  if (!indexEntry) throw new Error(msg("Файл не является модпаком Modrinth (.mrpack)"))
  const index = JSON.parse(indexEntry.getData().toString('utf8')) as MrpackIndex

  const gameVersion = index.dependencies.minecraft ?? profile.versionId
  const { loader, version: loaderVersion } = detectLoader(index.dependencies)
  updateProfile(profileId, {
    versionId: gameVersion,
    loader,
    modpack: {
      name: index.name ?? path.basename(file, '.mrpack'),
      version: index.versionId ?? '1.0.0',
      source: 'mrpack'
    }
  })

  emitProgress({
    phase: 'modpack',
    message: msg('Установка модпака {name}', { name: index.name }),
    percent: 5,
    current: 0,
    total: index.files.length,
    bytes: 0,
    totalBytes: 0,
    speed: 0
  })
  await installProfile(profileId, loaderVersion, true)

  const directory = instanceDir(profileId)
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
  await downloadMany(tasks, 'modpack', msg('Модпак {name}', { name: index.name }), 3)

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
  emitToast('success', msg('Модпак «{name}» установлен', { name: index.name }))
}

export async function installModpackFromFile(profileId: string): Promise<void> {
  const result = await dialog.showOpenDialog({
    title: msg("Выберите файл модпака"),
    filters: [
      { name: msg("Modrinth модпак"), extensions: ['mrpack', 'zip'] },
      { name: msg("Все файлы"), extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths[0]) return
  await installMrpack(profileId, result.filePaths[0])
}

export async function installModpackFromPath(profileId: string, filePath: string): Promise<void> {
  await installMrpack(profileId, filePath)
}

export async function installModpackFromModrinth(profileId: string, projectId: string): Promise<void> {
  const versions = await getModVersionsForMrpack(projectId)
  const version = versions[0]
  const file = version?.files.find((entry) => entry.filename.endsWith('.mrpack')) ?? version?.files[0]
  if (!file) throw new Error(msg("У модпака нет файла для установки"))

  const temp = path.join(dirs.cache, `mrpack-download-${uid()}.mrpack`)
  await downloadMany(
    [{ url: file.url, dest: temp, sha1: file.hashes.sha1, size: file.size, label: file.filename }],
    'modpack',
    msg("Скачивание модпака"),
    1
  )
  await installMrpack(profileId, temp)
  await fs.remove(temp)
}
