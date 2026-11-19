import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import AdmZip from 'adm-zip'
import fs from 'fs-extra'
import { fetchJson } from './http'
import { downloadMany } from './downloader'
import { emitProgress, emitToast, uid } from './events'
import { msg } from './i18n'
import { dirs } from './paths'
import { findJava, inspectJava, requiredJavaMajor } from './java'
import { getState, setState, updateProfile } from './store'
import type { JavaInfo } from '@shared/types'

const execFileAsync = promisify(execFile)
const inFlight = new Map<number, Promise<JavaInfo>>()

interface AdoptiumAsset {
  binary?: {
    package?: {
      link?: string
      name?: string
      size?: number
      checksum?: string
      checksum_type?: string
    }
  }
}

function platformParams(): { os: string; arch: string } {
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'
  const arch = process.arch === 'arm64' ? 'aarch64' : process.arch === 'ia32' ? 'x86' : 'x64'
  return { os, arch }
}

async function fileHash(file: string, algorithm: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm)
    const stream = fs.createReadStream(file)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

async function findJavaExecutable(base: string, depth = 0): Promise<string | null> {
  if (depth > 4 || !(await fs.pathExists(base))) return null
  const direct = process.platform === 'win32' ? path.join(base, 'bin', 'java.exe') : path.join(base, 'bin', 'java')
  if (await fs.pathExists(direct)) return direct

  let entries: string[] = []
  try {
    entries = await fs.readdir(base)
  } catch {
    return null
  }
  for (const entry of entries) {
    const child = path.join(base, entry)
    try {
      if (!(await fs.stat(child)).isDirectory()) continue
    } catch {
      continue
    }
    const found = await findJavaExecutable(child, depth + 1)
    if (found) return found
  }
  return null
}

function progressJava(percent: number, label: string): void {
  emitProgress({
    phase: 'java',
    message: label,
    percent,
    current: percent,
    total: 100,
    bytes: 0,
    totalBytes: 0,
    speed: 0
  })
}

async function downloadAsset(major: number): Promise<{ archive: string; checksum?: string; checksumType?: string }> {
  const { os, arch } = platformParams()
  const url = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?os=${os}&architecture=${arch}&image_type=jre&vendor=eclipse`
  const releases = await fetchJson<AdoptiumAsset[]>(url, 60000)
  const asset = releases.find((release) => release.binary?.package?.link)?.binary?.package
  if (!asset?.link) throw new Error(msg('Не удалось установить Java {version}', { version: major }))

  const name = asset.name ?? path.basename(new URL(asset.link).pathname)
  const archive = path.join(dirs.javaCache, name)
  const task = {
    url: asset.link,
    dest: archive,
    size: asset.size,
    label: msg('Загрузка Java {version}...', { version: major })
  }
  await downloadMany([task], 'java', task.label, 1)

  const checksumType = (asset.checksum_type ?? '').toLowerCase()
  if (asset.checksum && (checksumType === 'sha256' || checksumType === 'sha-256')) {
    const actual = await fileHash(archive, 'sha256')
    if (actual.toLowerCase() !== asset.checksum.toLowerCase()) {
      throw new Error(msg('Контрольная сумма не совпала: {label}', { label: name }))
    }
  }
  return { archive, checksum: asset.checksum, checksumType }
}

async function extractArchive(archive: string, target: string): Promise<void> {
  await fs.ensureDir(target)
  if (archive.toLowerCase().endsWith('.zip')) {
    new AdmZip(archive).extractAllTo(target, true)
    return
  }
  if (archive.toLowerCase().endsWith('.tar.gz') || archive.toLowerCase().endsWith('.tgz')) {
    await execFileAsync('tar', ['-xzf', archive, '-C', target], { timeout: 180000 })
    return
  }
  throw new Error(msg('Не удалось установить Java {version}', { version: path.basename(archive) }))
}

async function installJava(major: number, profileId?: string): Promise<JavaInfo> {
  const label = msg('Загрузка Java {version}...', { version: major })
  progressJava(5, label)
  const { archive } = await downloadAsset(major)

  progressJava(75, msg('Распаковка Java...'))
  const target = path.join(dirs.java, `temurin-${major}-${uid().slice(0, 6)}`)
  await extractArchive(archive, target)

  const executable = await findJavaExecutable(target)
  const info = executable ? await inspectJava(executable) : null
  if (!info?.valid) throw new Error(msg('Не удалось установить Java {version}', { version: major }))

  const state = getState()
  setState({ settings: { ...state.settings, javaPath: info.path } })
  if (profileId) updateProfile(profileId, { javaPath: info.path })

  progressJava(100, msg('Java {version} установлена: {path}', { version: major, path: info.path }))
  emitToast('success', msg('Java {version} установлена: {path}', { version: major, path: info.path }))
  return info
}

/**
 * Returns a Java runtime suitable for `major`. When no compatible Java is
 * installed, downloads a Temurin JRE into the launcher data directory and
 * remembers it as the default (and for the given profile, if provided).
 */
export async function ensureJava(major?: number, profileId?: string, explicit = false): Promise<JavaInfo> {
  const state = getState()
  const profile = profileId ? state.profiles.find((entry) => entry.id === profileId) : undefined
  const target = major ?? requiredJavaMajor(profile?.versionId ?? '')

  if (profile?.javaPath) {
    const configured = await inspectJava(profile.javaPath)
    if (configured?.valid && configured.major >= target) return configured
  }

  const existing = await findJava(target)
  if (existing.valid) return existing

  if (!explicit && state.settings.autoInstallJava === false) {
    throw new Error(msg('Требуется Java {major} или новее', { major: target }))
  }

  let pending = inFlight.get(target)
  if (!pending) {
    pending = installJava(target, profileId).finally(() => inFlight.delete(target))
    inFlight.set(target, pending)
  }
  return pending
}
