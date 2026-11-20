import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import { BrowserWindow, dialog } from 'electron'
import { msg } from './i18n'
import { instanceDir } from './paths'
import { getState, setState } from './store'
import { emitLog, emitProgress, emitToast } from './events'
import { sanitizeProfile } from './profileTransfer'
import type { ImportCandidate, LoaderType } from '@shared/types'

interface PackComponent {
  uid?: string
  version?: string
}

interface MmcPack {
  components?: PackComponent[]
}

interface CurseManifest {
  name?: string
  version?: string
  minecraft?: {
    version?: string
    modLoaders?: Array<{ id?: string; primary?: boolean }>
  }
  overrides?: string
}

interface OfficialProfileEntry {
  name?: string
  lastVersionId?: string
  gameDir?: string
}

interface OfficialProfiles {
  profiles?: Record<string, OfficialProfileEntry>
}

interface CopyStats {
  files: number
  bytes: number
}

interface ImportData {
  versionId: string
  loader: LoaderType
  loaderVersionId?: string
  stats: CopyStats
}

const DEFAULT_VERSION = '1.20.1'
const MAX_FILE_BYTES = 512 * 1024 * 1024
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024

const FOLDER_ITEMS: Record<'multimc' | 'official', string[]> = {
  multimc: ['saves', 'mods', 'resourcepacks', 'shaderpacks', 'config', 'options.txt', 'crash-reports'],
  official: ['saves', 'mods', 'resourcepacks', 'shaderpacks', 'options.txt', 'config']
}

function progress(message: string, percent: number): void {
  emitProgress({
    phase: 'modpack',
    message,
    percent,
    current: percent,
    total: 100,
    bytes: 0,
    totalBytes: 0,
    speed: 0
  })
}

function warn(message: string): void {
  emitLog('warn', message)
}

function info(message: string): void {
  emitLog('info', message)
}

/** Paths inside an instance/archive may never be absolute or escape via '..'. */
function isSafeRelative(relative: string): boolean {
  if (!relative || relative.includes('\0')) return false
  if (path.isAbsolute(relative) || /^[a-zA-Z]:/.test(relative)) return false
  return relative.replace(/\\/g, '/').split('/').every((part) =>
    Boolean(part) && part !== '.' && part !== '..' && !part.includes(':')
  )
}

function isSafeRoot(root: string): boolean {
  return typeof root === 'string' && path.isAbsolute(root) && !root.includes('\0') && !root.split(/[\\/]/).includes('..')
}

function within(target: string, destination: string): boolean {
  const root = path.resolve(target)
  const resolved = path.resolve(destination)
  return resolved === root || resolved.startsWith(`${root}${path.sep}`)
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T
}

function versionValue(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_VERSION
  const version = value.trim()
  return version === 'latest-release' || version === 'latest-snapshot' || version === 'release'
    ? DEFAULT_VERSION
    : version
}

function parseLoaderId(id: string | undefined): { loader: LoaderType; loaderVersionId?: string } {
  if (!id) return { loader: 'vanilla' }
  const [name, ...rest] = id.split('-')
  const key = name.toLowerCase()
  const loader: LoaderType =
    key === 'fabric' ? 'fabric' : key === 'forge' ? 'forge' : key === 'neoforge' ? 'neoforge' : 'vanilla'
  return { loader, loaderVersionId: loader === 'vanilla' ? undefined : rest.join('-') || undefined }
}

function parseMmcPack(pack: MmcPack): { versionId?: string; loader: LoaderType; loaderVersionId?: string } {
  const loaders: Record<string, LoaderType> = {
    'net.fabricmc.fabric-loader': 'fabric',
    'net.minecraftforge.forge': 'forge',
    'net.neoforged.neoforge': 'neoforge',
    'org.quiltmc.quilt-loader': 'fabric'
  }
  let versionId: string | undefined
  let loader: LoaderType = 'vanilla'
  let loaderVersionId: string | undefined
  for (const component of Array.isArray(pack?.components) ? pack.components : []) {
    if (!component || typeof component !== 'object') continue
    const uid = typeof component.uid === 'string' ? component.uid : ''
    const version = typeof component.version === 'string' ? component.version : ''
    if (!version) continue
    if (uid === 'net.minecraft') versionId = version
    else if (loaders[uid]) {
      loader = loaders[uid]
      loaderVersionId = version
    }
  }
  return { versionId, loader, loaderVersionId }
}

async function parseInstanceConfig(dir: string): Promise<Record<string, string>> {
  const values: Record<string, string> = {}
  try {
    const text = await fs.readFile(path.join(dir, 'instance.cfg'), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue
      const separator = trimmed.indexOf('=')
      if (separator < 0) continue
      values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim()
    }
  } catch (error) {
    warn(msg('Не удалось прочитать instance.cfg в {path}: {error}', { path: dir, error: String(error) }))
  }
  return values
}

function readManifest(zip: AdmZip): CurseManifest {
  const data = JSON.parse(zip.readAsText('manifest.json')) as CurseManifest
  return data && typeof data === 'object' ? data : {}
}

function overridesPrefix(manifest: CurseManifest): string {
  const overrides = typeof manifest.overrides === 'string' && isSafeRelative(manifest.overrides)
    ? manifest.overrides.replace(/\\/g, '/')
    : 'overrides'
  return `${overrides.replace(/\/+$/, '')}/`
}

function multimcRoots(): string[] {
  const home = os.homedir()
  const dataHome = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share')
  const appData = process.env.APPDATA
  const roots = [
    path.join(home, '.minecraft'),
    path.join(home, '.minecraft', 'instances'),
    path.join(home, 'MultiMC', 'instances'),
    path.join(dataHome, 'MultiMC', 'instances'),
    path.join(dataHome, 'PrismLauncher', 'instances'),
    path.join(home, '.local', 'share', 'PrismLauncher', 'instances'),
    path.join(home, 'Library', 'Application Support', 'MultiMC', 'instances'),
    path.join(home, 'Library', 'Application Support', 'PrismLauncher', 'instances'),
    path.join(home, '.var', 'app', 'org.prismlauncher.PrismLauncher', 'data', 'PrismLauncher', 'instances')
  ]
  if (appData) roots.push(path.join(appData, 'MultiMC', 'instances'), path.join(appData, 'PrismLauncher', 'instances'))
  return [...new Set(roots)]
}

function officialManifestPaths(): string[] {
  const home = os.homedir()
  const appData = process.env.APPDATA
  const dataHome = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share')
  const paths = [
    path.join(home, '.minecraft', 'launcher_profiles.json'),
    path.join(dataHome, 'minecraft', 'launcher_profiles.json'),
    path.join(home, 'Library', 'Application Support', 'minecraft', 'launcher_profiles.json')
  ]
  if (appData) paths.push(path.join(appData, '.minecraft', 'launcher_profiles.json'))
  return [...new Set(paths)]
}

async function detectMultiMC(): Promise<ImportCandidate[]> {
  const candidates: ImportCandidate[] = []
  const seen = new Set<string>()
  let foundRoot = false
  for (const root of multimcRoots()) {
    let entries
    try {
      if (!(await fs.pathExists(root))) continue
      foundRoot = true
      entries = await fs.readdir(root, { withFileTypes: true })
    } catch (error) {
      warn(msg('Не удалось прочитать каталог {path}: {error}', { path: root, error: String(error) }))
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !isSafeRelative(entry.name)) continue
      const dir = path.join(root, entry.name)
      try {
        if (!(await fs.pathExists(path.join(dir, 'instance.cfg')))) continue
        if (!(await fs.pathExists(path.join(dir, 'mmc-pack.json')))) continue
        const config = await parseInstanceConfig(dir)
        const pack = parseMmcPack(await readJson<MmcPack>(path.join(dir, 'mmc-pack.json')))
        const name = config.name?.trim() || entry.name
        const key = `${dir}|${name}`
        if (seen.has(key)) continue
        seen.add(key)
        const launcher = /prism/i.test(root) ? msg('Prism Launcher') : msg('MultiMC')
        candidates.push({
          id: `multimc-${crypto.randomUUID()}`,
          source: 'multimc',
          path: dir,
          name,
          versionId: pack.versionId ?? config.IntendedVersion ?? DEFAULT_VERSION,
          loader: pack.loader,
          loaderVersionId: pack.loaderVersionId,
          details: pack.loaderVersionId ? `${launcher} · ${pack.loaderVersionId}` : launcher
        })
      } catch (error) {
        warn(msg('Не удалось прочитать экземпляр {path}: {error}', { path: dir, error: String(error) }))
      }
    }
  }
  if (!foundRoot) warn(msg('Экземпляры MultiMC и Prism Launcher не найдены'))
  return candidates
}

async function detectCurseForge(): Promise<ImportCandidate[]> {
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
  const options: Electron.OpenDialogOptions = {
    title: msg('Выберите архивы CurseForge'),
    filters: [
      { name: msg('Архивы CurseForge'), extensions: ['zip'] },
      { name: msg('Все файлы'), extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  }
  const chosen = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  if (chosen.canceled || chosen.filePaths.length === 0) {
    info(msg('Выбор архивов CurseForge отменён'))
    return []
  }

  const candidates: ImportCandidate[] = []
  for (const file of chosen.filePaths) {
    try {
      if (!isSafeRoot(file)) {
        warn(msg('Недопустимый путь архива CurseForge: {path}', { path: file }))
        continue
      }
      const zip = new AdmZip(file)
      if (!zip.getEntry('manifest.json')) {
        warn(msg('Архив не содержит manifest.json: {path}', { path: file }))
        continue
      }
      const manifest = readManifest(zip)
      const prefix = overridesPrefix(manifest)
      const hasOverrides = zip.getEntries().some((entry) => {
        const name = entry.entryName.replace(/\\/g, '/')
        return !entry.isDirectory && name.startsWith(prefix) && isSafeRelative(name.slice(prefix.length))
      })
      if (!hasOverrides) {
        warn(msg('Архив CurseForge не содержит папку overrides: {path}', { path: file }))
        continue
      }
      const primary = manifest.minecraft?.modLoaders?.find((loader) => loader?.primary)
        ?? manifest.minecraft?.modLoaders?.[0]
      const { loader, loaderVersionId } = parseLoaderId(primary?.id)
      const details = [manifest.version, loaderVersionId].filter(Boolean).join(' · ') || msg('CurseForge')
      candidates.push({
        id: `curseforge-${crypto.randomUUID()}`,
        source: 'curseforge',
        path: file,
        name: manifest.name?.trim() || path.basename(file, '.zip'),
        versionId: manifest.minecraft?.version?.trim() || DEFAULT_VERSION,
        loader,
        loaderVersionId,
        details
      })
    } catch (error) {
      warn(msg('Не удалось прочитать архив CurseForge {path}: {error}', { path: file, error: String(error) }))
    }
  }
  return candidates
}

async function detectOfficial(): Promise<ImportCandidate[]> {
  const candidates: ImportCandidate[] = []
  let found = false
  for (const file of officialManifestPaths()) {
    try {
      if (!(await fs.pathExists(file))) continue
      found = true
      const data = await readJson<OfficialProfiles>(file)
      const profiles = data && typeof data === 'object' ? data.profiles : undefined
      if (!profiles || typeof profiles !== 'object') continue
      for (const [key, entry] of Object.entries(profiles)) {
        if (!entry || typeof entry !== 'object') continue
        const name = (typeof entry.name === 'string' && entry.name.trim()) || key
        const rawDir = typeof entry.gameDir === 'string' && entry.gameDir.trim()
          ? entry.gameDir
          : path.dirname(file)
        const gameDir = path.isAbsolute(rawDir) ? path.resolve(rawDir) : path.resolve(path.dirname(file), rawDir)
        if (!isSafeRoot(gameDir) || !(await fs.pathExists(gameDir))) {
          warn(msg('Не найден каталог игры профиля «{name}»: {path}', { name, path: gameDir }))
          continue
        }
        candidates.push({
          id: `official-${crypto.randomUUID()}`,
          source: 'official',
          path: gameDir,
          name,
          versionId: versionValue(entry.lastVersionId),
          loader: 'vanilla',
          details: msg('Официальный лаунчер')
        })
      }
    } catch (error) {
      warn(msg('Не удалось прочитать launcher_profiles.json: {path}: {error}', { path: file, error: String(error) }))
    }
  }
  if (!found) warn(msg('Профили официального лаунчера не найдены'))
  return candidates
}

/** Official launcher entries are always reported last. */
export async function detectImportSources(): Promise<ImportCandidate[]> {
  const multimc = await detectMultiMC()
  const curseforge = await detectCurseForge()
  const official = await detectOfficial()
  return [...multimc, ...curseforge, ...official]
}

async function copyTree(from: string, to: string, stats: CopyStats): Promise<void> {
  const entries = await fs.readdir(from, { withFileTypes: true })
  for (const entry of entries) {
    if (!isSafeRelative(entry.name)) {
      warn(msg('Пропущен небезопасный путь: {path}', { path: entry.name }))
      continue
    }
    const source = path.join(from, entry.name)
    const destination = path.join(to, entry.name)
    if (!within(to, destination)) {
      warn(msg('Пропущен путь вне папки сборки: {path}', { path: source }))
      continue
    }
    if (entry.isSymbolicLink()) {
      warn(msg('Пропущена символическая ссылка: {path}', { path: source }))
      continue
    }
    if (entry.isDirectory()) {
      await fs.ensureDir(destination)
      await copyTree(source, destination, stats)
      continue
    }
    if (!entry.isFile()) continue
    const size = (await fs.stat(source)).size
    if (size > MAX_FILE_BYTES || stats.bytes + size > MAX_TOTAL_BYTES) {
      warn(msg('Пропущен слишком большой файл: {path}', { path: source }))
      continue
    }
    await fs.ensureDir(path.dirname(destination))
    await fs.copyFile(source, destination)
    stats.files++
    stats.bytes += size
  }
}

async function copyItems(from: string, to: string, items: string[], stats: CopyStats): Promise<void> {
  for (const item of items) {
    if (!isSafeRelative(item)) continue
    const source = path.join(from, item)
    const destination = path.join(to, item)
    if (!within(to, destination)) continue
    try {
      if (!(await fs.pathExists(source))) continue
      const stat = await fs.lstat(source)
      if (stat.isSymbolicLink()) {
        warn(msg('Пропущена символическая ссылка: {path}', { path: source }))
        continue
      }
      if (stat.isDirectory()) {
        await fs.ensureDir(destination)
        await copyTree(source, destination, stats)
        continue
      }
      if (!stat.isFile()) continue
      if (stat.size > MAX_FILE_BYTES || stats.bytes + stat.size > MAX_TOTAL_BYTES) {
        warn(msg('Пропущен слишком большой файл: {path}', { path: source }))
        continue
      }
      await fs.ensureDir(path.dirname(destination))
      await fs.copyFile(source, destination)
      stats.files++
      stats.bytes += stat.size
    } catch (error) {
      warn(msg('Не удалось скопировать {path}: {error}', { path: source, error: String(error) }))
    }
  }
}

async function applyMultiMC(candidate: ImportCandidate, target: string, stats: CopyStats): Promise<ImportData | null> {
  const root = path.resolve(candidate.path)
  const packFile = path.join(root, 'mmc-pack.json')
  if (!(await fs.pathExists(packFile))) {
    warn(msg('Не найден mmc-pack.json: {path}', { path: root }))
    return null
  }
  const config = await parseInstanceConfig(root)
  const pack = parseMmcPack(await readJson<MmcPack>(packFile))
  for (const container of ['minecraft', '.minecraft', '']) {
    const base = container ? path.join(root, container) : root
    if (!(await fs.pathExists(base))) continue
    await copyItems(base, target, FOLDER_ITEMS.multimc, stats)
  }
  return {
    versionId: pack.versionId ?? config.IntendedVersion ?? versionValue(candidate.versionId),
    loader: pack.loader,
    loaderVersionId: pack.loaderVersionId ?? candidate.loaderVersionId,
    stats
  }
}

async function applyCurseForge(candidate: ImportCandidate, target: string, stats: CopyStats): Promise<ImportData | null> {
  const file = path.resolve(candidate.path)
  if (!(await fs.pathExists(file))) {
    warn(msg('Архив CurseForge не найден: {path}', { path: file }))
    return null
  }
  const zip = new AdmZip(file)
  if (!zip.getEntry('manifest.json')) {
    warn(msg('Архив не содержит manifest.json: {path}', { path: file }))
    return null
  }
  const manifest = readManifest(zip)
  const prefix = overridesPrefix(manifest)
  const entries = zip.getEntries()
    .map((entry) => ({ entry, name: entry.entryName.replace(/\\/g, '/') }))
    .filter((item) =>
      !item.entry.isDirectory && item.name.startsWith(prefix) && isSafeRelative(item.name.slice(prefix.length))
    )
  if (entries.length === 0) {
    warn(msg('Архив CurseForge не содержит папку overrides: {path}', { path: file }))
    return null
  }
  const primary = manifest.minecraft?.modLoaders?.find((loader) => loader?.primary)
    ?? manifest.minecraft?.modLoaders?.[0]
  const { loader, loaderVersionId } = parseLoaderId(primary?.id)
  for (const item of entries) {
    const relative = item.name.slice(prefix.length)
    const destination = path.join(target, relative)
    if (!isSafeRelative(relative) || !within(target, destination)) {
      warn(msg('Пропущен небезопасный путь в архиве: {path}', { path: item.entry.entryName }))
      continue
    }
    const data = zip.readFile(item.entry)
    if (!data || data.length > MAX_FILE_BYTES || stats.bytes + data.length > MAX_TOTAL_BYTES) {
      warn(msg('Пропущен слишком большой файл в архиве: {path}', { path: item.entry.entryName }))
      continue
    }
    await fs.ensureDir(path.dirname(destination))
    await fs.writeFile(destination, data)
    stats.files++
    stats.bytes += data.length
  }
  return {
    versionId: manifest.minecraft?.version?.trim() || versionValue(candidate.versionId),
    loader,
    loaderVersionId: loaderVersionId ?? candidate.loaderVersionId,
    stats
  }
}

async function applyOfficial(candidate: ImportCandidate, target: string, stats: CopyStats): Promise<ImportData | null> {
  let versionId = versionValue(candidate.versionId)
  let gameDir = path.resolve(candidate.path)
  for (const file of officialManifestPaths()) {
    try {
      if (!(await fs.pathExists(file))) continue
      const data = await readJson<OfficialProfiles>(file)
      for (const [key, entry] of Object.entries(data?.profiles ?? {})) {
        if (!entry || typeof entry !== 'object') continue
        const name = (typeof entry.name === 'string' && entry.name.trim()) || key
        if (name !== candidate.name) continue
        versionId = versionValue(entry.lastVersionId)
        const rawDir = typeof entry.gameDir === 'string' && entry.gameDir.trim()
          ? entry.gameDir
          : path.dirname(file)
        const resolved = path.isAbsolute(rawDir) ? path.resolve(rawDir) : path.resolve(path.dirname(file), rawDir)
        if (isSafeRoot(resolved)) gameDir = resolved
      }
    } catch (error) {
      warn(msg('Не удалось прочитать launcher_profiles.json: {path}: {error}', { path: file, error: String(error) }))
    }
  }
  if (!isSafeRoot(gameDir) || !(await fs.pathExists(gameDir))) {
    warn(msg('Каталог игры не найден: {path}', { path: gameDir }))
    return null
  }
  await copyItems(gameDir, target, FOLDER_ITEMS.official, stats)
  return { versionId, loader: 'vanilla', stats }
}

function uniqueName(name: string): string {
  const base = name.trim().slice(0, 80) || msg('Импортированная сборка')
  const used = new Set(getState().profiles.map((profile) => profile.name.toLocaleLowerCase()))
  if (!used.has(base.toLocaleLowerCase())) return base
  let index = 2
  while (used.has(msg('{name} ({index})', { name: base, index }).toLocaleLowerCase())) index++
  return msg('{name} ({index})', { name: base, index })
}

export async function importLauncherProfile(candidate: ImportCandidate): Promise<boolean> {
  if (!candidate || typeof candidate !== 'object') return false
  if (!['official', 'multimc', 'curseforge'].includes(candidate.source)) return false
  if (!isSafeRoot(candidate.path) || typeof candidate.name !== 'string' || !candidate.name.trim()) return false

  const label = candidate.name.trim()
  const id = crypto.randomUUID()
  const target = instanceDir(id)
  const stats: CopyStats = { files: 0, bytes: 0 }
  const title = msg('Импорт «{name}»...', { name: label })
  progress(title, 10)
  try {
    await fs.ensureDir(target)
    let data: ImportData | null
    if (candidate.source === 'multimc') data = await applyMultiMC(candidate, target, stats)
    else if (candidate.source === 'curseforge') data = await applyCurseForge(candidate, target, stats)
    else data = await applyOfficial(candidate, target, stats)

    if (!data) {
      await fs.remove(target).catch(() => undefined)
      warn(msg('Кандидат на импорт недействителен: {name}', { name: label }))
      emitToast('error', msg('Не удалось импортировать «{name}»', { name: label }))
      progress(title, 100)
      return false
    }

    progress(title, 80)
    const profile = sanitizeProfile({
      name: uniqueName(label),
      versionId: data.versionId,
      loader: data.loader,
      loaderVersionId: data.loaderVersionId
    }, id)
    const state = getState()
    setState({
      profiles: [...state.profiles, profile],
      selectedProfileId: profile.id
    })
    emitLog('info', msg('Импортирована сборка «{name}»: файлов {files}, размер {bytes}', {
      name: profile.name,
      files: stats.files,
      bytes: stats.bytes
    }))
    emitToast('success', msg('Сборка «{name}» импортирована', { name: profile.name }))
    progress(title, 100)
    return true
  } catch (error) {
    await fs.remove(target).catch(() => undefined)
    const message = error instanceof Error ? error.message : String(error)
    emitLog('error', msg('Ошибка импорта «{name}»: {error}', { name: label, error: message }))
    emitToast('error', msg('Не удалось импортировать «{name}»', { name: label }))
    progress(title, 100)
    return false
  }
}
