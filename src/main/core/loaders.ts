import path from 'node:path'
import { spawn } from 'node:child_process'
import fs from 'fs-extra'
import { dirs, versionDir } from './paths'
import { downloadToFile } from './downloader'
import { emitLog, emitProgress } from './events'
import { fetchJson, fetchText } from './http'
import { findJava } from './java'
import { installLibraries, readVersionJson, extractNatives, type VersionJson } from './install'
import type { LoaderType } from '@shared/types'

function emitLoader(message: string, percent: number): void {
  emitProgress({
    phase: 'loader',
    message,
    percent,
    current: 0,
    total: 1,
    bytes: 0,
    totalBytes: 0,
    speed: 0
  })
}

async function saveVersionJson(json: VersionJson): Promise<string> {
  const id = json.id
  const dir = versionDir(id)
  await fs.ensureDir(dir)
  await fs.writeJson(path.join(dir, `${id}.json`), json, { spaces: 2 })
  return id
}

async function installFabric(gameVersion: string, requestedVersion?: string): Promise<string> {
  emitLoader('Получение данных Fabric', 12)
  const loaders = await fetchJson<Array<{ version: string; stable?: boolean; maven: string }>>(
    `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}`
  )
  if (!loaders.length) throw new Error(`Fabric недоступен для Minecraft ${gameVersion}`)
  const selected = requestedVersion
    ? loaders.find((entry) => entry.version === requestedVersion)
    : (loaders.find((entry) => entry.stable) ?? loaders[0])
  if (!selected) throw new Error(`Версия Fabric ${requestedVersion} не найдена`)

  const intermediaries = await fetchJson<Array<{ version: string; maven: string }>>(
    `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${selected.version}/intermediary`
  )
  const intermediary = intermediaries[0]
  if (!intermediary) throw new Error('Не удалось получить intermediary для Fabric')

  emitLoader('Сборка профиля Fabric', 35)
  const profile = await fetchJson<VersionJson>(
    `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${selected.version}/${intermediary.version}/profile/json`
  )
  profile.inheritsFrom = profile.inheritsFrom ?? gameVersion
  const id = await saveVersionJson(profile)
  emitLoader('Установка библиотек Fabric', 60)
  await installLibraries(profile, 'библиотеки Fabric')
  extractNatives(profile)
  emitLoader('Fabric установлен', 100)
  return id
}

function runInstaller(jarPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    void findJava().then((java) => {
      if (!java.valid) {
        reject(new Error('Java не найдена — не удалось установить загрузчик'))
        return
      }
      const child = spawn(java.path, ['-jar', jarPath, ...args], {
        cwd: dirs.root,
        windowsHide: true
      })
      let output = ''
      const consume = (chunk: Buffer) => {
        const text = chunk.toString()
        output += text
        for (const line of text.split(/\r?\n/).filter(Boolean)) emitLog('info', `[installer] ${line}`)
      }
      child.stdout.on('data', consume)
      child.stderr.on('data', consume)
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Установщик завершился с кодом ${code}: ${output.slice(-500)}`))
      })
    })
  })
}

async function findInstalledVersion(pattern: RegExp): Promise<string | null> {
  const entries = await fs.readdir(dirs.versions)
  const matches = entries.filter((entry) => pattern.test(entry) && fs.existsSync(path.join(dirs.versions, entry, `${entry}.json`)))
  return matches.sort().at(-1) ?? null
}

async function installForge(gameVersion: string, requestedVersion?: string): Promise<string> {
  emitLoader('Поиск версии Forge', 10)
  const promotions = await fetchJson<{ promos: Record<string, string> }>(
    'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
  )
  let forgeVersion: string | undefined = requestedVersion ?? promotions.promos[`${gameVersion}-recommended`] ?? promotions.promos[`${gameVersion}-latest`]
  if (!forgeVersion) {
    const maven = await fetchText('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml').catch(() => '')
    const versions = [...maven.matchAll(/<version>([^<]+)<\/version>/g)].map((match) => match[1])
    forgeVersion = versions.filter((version) => version.startsWith(`${gameVersion}-`)).map((version) => version.slice(gameVersion.length + 1)).at(-1)
  }
  if (!forgeVersion) throw new Error(`Не удалось найти Forge для Minecraft ${gameVersion}`)

  const fullVersion = `${gameVersion}-${forgeVersion}`
  const jarPath = path.join(dirs.installers, `forge-${fullVersion}-installer.jar`)
  emitLoader('Скачивание установщика Forge', 25)
  await downloadToFile(
    `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullVersion}/forge-${fullVersion}-installer.jar`,
    jarPath,
    'loader',
    'установщик Forge'
  )
  emitLoader('Установка Forge (это может занять минуту)', 50)
  await runInstaller(jarPath, ['--installClient', dirs.root])
  const id = (await findInstalledVersion(new RegExp(`${gameVersion}-forge-${forgeVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))) ?? `${gameVersion}-forge-${forgeVersion}`
  const json = await readVersionJson(id)
  if (json) {
    emitLoader('Установка библиотек Forge', 75)
    await installLibraries(json, 'библиотеки Forge')
    extractNatives(json)
  }
  emitLoader('Forge установлен', 100)
  return id
}

async function installNeoForge(gameVersion: string, requestedVersion?: string): Promise<string> {
  emitLoader('Поиск версии NeoForge', 10)
  const metadata = await fetchText('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml')
  const versions = [...metadata.matchAll(/<version>([^<]+)<\/version>/g)].map((match) => match[1])
  const [, major, minor] = gameVersion.split('.')
  const prefix = `${major}${minor}.`
  const candidates = versions.filter((version) => version.startsWith(prefix))
  let neoVersion = requestedVersion ?? candidates.at(-1)
  if (!neoVersion) {
    const release = metadata.match(/<release>([^<]+)<\/release>/)?.[1]
    neoVersion = release
  }
  if (!neoVersion) throw new Error(`Не удалось найти NeoForge для Minecraft ${gameVersion}`)

  const jarPath = path.join(dirs.installers, `neoforge-${neoVersion}-installer.jar`)
  emitLoader('Скачивание установщика NeoForge', 25)
  await downloadToFile(
    `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoVersion}/neoforge-${neoVersion}-installer.jar`,
    jarPath,
    'loader',
    'установщик NeoForge'
  )
  emitLoader('Установка NeoForge', 50)
  await runInstaller(jarPath, ['--installClient', dirs.root])
  const escaped = neoVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const id = (await findInstalledVersion(new RegExp(`${gameVersion}-neoforge-${escaped}`))) ?? `${gameVersion}-neoforge-${neoVersion}`
  const json = await readVersionJson(id)
  if (json) {
    emitLoader('Установка библиотек NeoForge', 75)
    await installLibraries(json, 'библиотеки NeoForge')
    extractNatives(json)
  }
  emitLoader('NeoForge установлен', 100)
  return id
}

export async function installLoader(
  loader: LoaderType,
  gameVersion: string,
  requestedVersion?: string
): Promise<string | undefined> {
  if (loader === 'vanilla') return undefined
  if (loader === 'fabric') return installFabric(gameVersion, requestedVersion)
  if (loader === 'forge') return installForge(gameVersion, requestedVersion)
  return installNeoForge(gameVersion, requestedVersion)
}
