import path from 'node:path'
import { msg } from './i18n'
import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import { dirs, versionDir } from './paths'
import { downloadMany, type DownloadTask } from './downloader'
import { fetchJson } from './http'
import { markInstalled } from './store'
import type { VersionManifest, VersionSummary } from '@shared/types'

const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'

export interface Rule {
  action: 'allow' | 'disallow'
  os?: { name?: string; version?: string; arch?: string }
  features?: Record<string, boolean>
}

export interface ArgItem {
  rules?: Rule[]
  value: string | string[]
}

// Mojang в новых версиях метаданных смешивает объекты с rules/value и обычные строки.
export type Arg = string | ArgItem

export interface Library {
  name: string
  downloads?: {
    artifact?: { url: string; size: number; sha1: string; path?: string }
    classifiers?: Record<string, { url: string; size: number; sha1: string; path?: string }>
  }
  rules?: Rule[]
  natives?: Record<string, string>
  url?: string
  action?: string
}

export interface VersionJson {
  id: string
  inheritsFrom?: string
  type?: string
  time?: string
  released?: string
  mainClass?: string
  minecraftArguments?: string
  arguments?: { game?: Arg[]; jvm?: Arg[] }
  libraries?: Library[]
  downloads?: {
    client?: { url: string; size: number; sha1: string }
    server?: { url: string; size: number; sha1: string }
    [key: string]: { url: string; size: number; sha1: string } | undefined
  }
  assetIndex?: { id: string; url: string; size: number; sha1?: string }
  assets?: string
  javaVersion?: { major: number; component?: string }
  logging?: {
    client?: { argument: string; file: { id: string; url: string; size: number; sha1: string } }
  }
  client?: { url: string; size: number; sha1: string }
  path?: string
  [key: string]: unknown
}

export const osKey = (): string =>
  process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux'

function osMatches(rule: Rule): boolean {
  if (!rule.os) return true
  if (rule.os.name && rule.os.name !== osKey()) return false
  if (rule.os.arch) {
    const arch = process.arch === 'x64' ? 'x64' : process.arch === 'ia32' ? 'x86' : process.arch
    if (rule.os.arch !== arch && rule.os.arch !== (process.arch === 'x64' ? '64' : '32')) return false
  }
  return true
}

export function ruleAllowed(rules: Rule[] | undefined, features: Record<string, boolean> = {}): boolean {
  if (!rules?.length) return true
  let allowed = false
  for (const rule of rules) {
    const featureMatch = !rule.features || Object.entries(rule.features).every(([key, value]) => Boolean(features[key]) === value)
    if (osMatches(rule) && featureMatch) allowed = rule.action === 'allow'
  }
  return allowed
}

export function argValues(items: Arg[] | undefined, features: Record<string, boolean> = {}): string[] {
  const result: string[] = []
  for (const item of items ?? []) {
    if (typeof item === 'string') {
      result.push(item)
      continue
    }
    if (!item || typeof item.value === 'undefined') continue
    if (!ruleAllowed(item.rules, features)) continue
    if (Array.isArray(item.value)) result.push(...item.value)
    else result.push(item.value)
  }
  return result
}

export function libraryArtifactPath(name: string, classifier?: string): string {
  const parts = name.split(':')
  if (parts.length < 3) return name.replace(/\./g, '/')
  const [group, artifact, versionWithExt, ...rest] = parts
  let version = versionWithExt
  let extension = 'jar'
  const atIndex = version.indexOf('@')
  if (atIndex !== -1) {
    extension = version.slice(atIndex + 1)
    version = version.slice(0, atIndex)
  }
  const qualifier = rest.length ? `-${rest.join('-')}` : ''
  const suffix = classifier ? `-${classifier}` : qualifier
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}${suffix}.${extension}`
}

function libraryUrl(lib: Library, artifactPath: string): string {
  if (lib.downloads?.artifact?.url) return lib.downloads.artifact.url
  if (lib.url) return lib.url.replace(/\/?$/, '/') + artifactPath
  return `https://libraries.minecraft.net/${artifactPath}`
}

export function nativeClassifier(lib: Library, key = osKey()): string | undefined {
  if (lib.natives?.[key]) {
    return lib.natives[key].replace(/\$\{arch\}/g, process.arch === 'x64' ? '64' : process.arch === 'ia32' ? '32' : process.arch)
  }
  const classifier = `natives-${key}`
  return lib.downloads?.classifiers?.[classifier] ? classifier : undefined
}

export function classpathLibraries(version: VersionJson): string[] {
  const result: string[] = []
  for (const lib of version.libraries ?? []) {
    if (lib.action === 'disallow' || !ruleAllowed(lib.rules)) continue
    if (nativeClassifier(lib)) continue
    const artifact = lib.downloads?.artifact
    const relative = artifact?.path ?? libraryArtifactPath(lib.name)
    result.push(path.join(dirs.libraries, relative))
  }
  return result
}

async function loadManifest(): Promise<VersionManifest> {
  const cachePath = path.join(dirs.cache, 'version_manifest.json')
  try {
    const manifest = await fetchJson<VersionManifest>(MANIFEST_URL)
    await fs.writeJson(cachePath, manifest)
    return manifest
  } catch {
    if (await fs.pathExists(cachePath)) return fs.readJson(cachePath)
    throw new Error(msg("Не удалось получить список версий Minecraft"))
  }
}

export async function getVersionList(): Promise<VersionManifest> {
  return loadManifest()
}

export async function findVersionSummary(versionId: string): Promise<VersionSummary | undefined> {
  const manifest = await loadManifest()
  return manifest.versions.find((version) => version.id === versionId)
}

export async function readVersionJson(versionId: string): Promise<VersionJson | null> {
  const file = path.join(versionDir(versionId), `${versionId}.json`)
  if (!(await fs.pathExists(file))) return null
  try {
    return await fs.readJson(file)
  } catch {
    return null
  }
}

export async function fetchVersionJson(versionId: string): Promise<VersionJson> {
  const local = await readVersionJson(versionId)
  if (local) return local
  const summary = await findVersionSummary(versionId)
  if (!summary) throw new Error(msg('Версия {version} не найдена в манифесте Mojang', { version: versionId }))
  const json = await fetchJson<VersionJson>(summary.url)
  await fs.ensureDir(versionDir(versionId))
  await fs.writeJson(path.join(versionDir(versionId), `${versionId}.json`), json, { spaces: 2 })
  return json
}

function mergeVersions(parent: VersionJson, child: VersionJson): VersionJson {
  const libraries = [...(parent.libraries ?? [])]
  const byName = new Map(libraries.map((lib, index) => [lib.name, index]))
  for (const lib of child.libraries ?? []) {
    const index = byName.get(lib.name)
    if (index === undefined) {
      byName.set(lib.name, libraries.length)
      libraries.push(lib)
    } else {
      libraries[index] = lib
    }
  }
  return {
    ...parent,
    ...child,
    libraries,
    arguments: {
      game: [...(parent.arguments?.game ?? []), ...(child.arguments?.game ?? [])],
      jvm: [...(parent.arguments?.jvm ?? []), ...(child.arguments?.jvm ?? [])]
    },
    minecraftArguments: child.minecraftArguments ?? parent.minecraftArguments
  }
}

export async function resolveVersion(versionId: string, seen = new Set<string>()): Promise<VersionJson> {
  if (seen.has(versionId)) throw new Error(msg('Циклическая зависимость версий: {version}', { version: versionId }))
  seen.add(versionId)
  const json = await fetchVersionJson(versionId)
  if (!json.inheritsFrom) return json
  const parent = await resolveVersion(json.inheritsFrom, seen)
  return mergeVersions(parent, json)
}

export async function installLibraries(version: VersionJson, label: string): Promise<void> {
  const tasks: DownloadTask[] = []
  for (const lib of version.libraries ?? []) {
    if (lib.action === 'disallow' || !ruleAllowed(lib.rules)) continue
    const artifact = lib.downloads?.artifact
    const relative = artifact?.path ?? libraryArtifactPath(lib.name)
    const dest = path.join(dirs.libraries, relative)
    if (artifact) {
      tasks.push({ url: artifact.url, dest, sha1: artifact.sha1, size: artifact.size, label: lib.name })
    } else if (await fs.pathExists(dest)) {
      continue
    } else {
      tasks.push({ url: libraryUrl(lib, relative), dest, label: lib.name })
    }

    const classifier = nativeClassifier(lib)
    const nativeArtifact = classifier ? lib.downloads?.classifiers?.[classifier] : undefined
    if (classifier && nativeArtifact) {
      tasks.push({
        url: nativeArtifact.url,
        dest: path.join(dirs.libraries, nativeArtifact.path ?? libraryArtifactPath(lib.name, classifier)),
        sha1: nativeArtifact.sha1,
        size: nativeArtifact.size,
        label: `${lib.name} (${classifier})`
      })
    }
  }
  await downloadMany(tasks, 'libraries', label)
}

export function extractNatives(version: VersionJson): void {
  const target = path.join(versionDir(version.id), 'natives')
  fs.ensureDirSync(target)
  for (const lib of version.libraries ?? []) {
    if (lib.action === 'disallow' || !ruleAllowed(lib.rules)) continue
    const classifier = nativeClassifier(lib)
    if (!classifier) continue
    const relative = lib.downloads?.classifiers?.[classifier]?.path ?? libraryArtifactPath(lib.name, classifier)
    const jar = path.join(dirs.libraries, relative)
    if (!fs.existsSync(jar)) continue
    try {
      const zip = new AdmZip(jar)
      for (const entry of zip.getEntries()) {
        const name = entry.entryName
        if (name.includes('/') && name.split('/').slice(0, -1).some((segment) => segment.toLowerCase() === 'meta-inf')) continue
        if (name.endsWith('/')) continue
        zip.extractEntryTo(entry, target, false, true)
      }
    } catch {
      // Библиотека без нативных компонентов — пропускаем
    }
  }
}

export async function installClientVersion(versionId: string, version: VersionJson): Promise<void> {
  const dir = versionDir(versionId)
  await fs.ensureDir(dir)

  const tasks: DownloadTask[] = []
  const client = version.downloads?.client ?? version.client
  if (!client) {
    throw new Error(msg('Не удалось определить файл клиента для {version}', { version: version.id }))
  }
  tasks.push({
    url: client.url,
    dest: path.join(dir, `${version.id}.jar`),
    sha1: client.sha1,
    size: client.size,
    label: `minecraft ${version.id}`
  })

  if (version.assetIndex) {
    const indexPath = path.join(dirs.assets, 'indexes', `${version.assetIndex.id}.json`)
    tasks.push({
      url: version.assetIndex.url,
      dest: indexPath,
      sha1: version.assetIndex.sha1,
      size: version.assetIndex.size,
      label: msg("индекс ассетов")
    })
    await downloadMany(tasks, 'version', msg("Загрузка клиента"), 4)
    await installAssets(version.assetIndex.id)
  } else {
    await downloadMany(tasks, 'version', msg("Загрузка клиента"), 4)
  }

  const loggingFile = version.logging?.client?.file
  if (loggingFile) {
    await downloadMany(
      [{
        url: loggingFile.url,
        dest: path.join(dir, loggingFile.id),
        sha1: loggingFile.sha1,
        size: loggingFile.size,
        label: msg("конфигурация логирования")
      }],
      'version',
      msg("Загрузка конфигурации"),
      1
    )
  }
}

async function installAssets(indexId: string): Promise<void> {
  const indexPath = path.join(dirs.assets, 'indexes', `${indexId}.json`)
  const index = await fs.readJson(indexPath) as { objects: Record<string, { hash: string; size: number }> }
  const tasks: DownloadTask[] = Object.values(index.objects).map((object) => ({
    url: `https://resources.download.minecraft.net/${object.hash.slice(0, 2)}/${object.hash}`,
    dest: path.join(dirs.assets, 'objects', object.hash.slice(0, 2), object.hash),
    sha1: object.hash,
    size: object.size,
    label: msg("ассеты")
  }))
  await downloadMany(tasks, 'assets', msg("Загрузка ассетов"), 3)

  if (indexId === 'legacy') {
    for (const [relative, object] of Object.entries(index.objects)) {
      const source = path.join(dirs.assets, 'objects', object.hash.slice(0, 2), object.hash)
      const target = path.join(dirs.assets, 'virtual', 'legacy', relative)
      if (await fs.pathExists(source)) {
        await fs.ensureDir(path.dirname(target))
        await fs.copy(source, target, { overwrite: true })
      }
    }
  }
}

export function markVersionInstalled(versionId: string): void {
  markInstalled(versionId)
}
