import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'fs-extra'
import { dirs, instanceDir, versionDir } from './paths'
import { getState, updateProfile } from './store'
import { emitGameStatus, emitLog, emitProgress } from './events'
import { findJava, inspectJava, requiredJavaMajor } from './java'
import { argValues, classpathLibraries, extractNatives, readVersionJson, resolveVersion, type VersionJson } from './install'
import type { GameStatus, JavaInfo } from '@shared/types'

let child: ChildProcess | null = null
let currentStatus: GameStatus = 'idle'
let startedAt = 0

export function getStatus(): GameStatus {
  return currentStatus
}

export function stopGame(): void {
  if (child && !child.killed) {
    emitLog('info', 'Остановка игры...')
    child.kill('SIGTERM')
    const handle = setTimeout(() => child?.kill('SIGKILL'), 4000)
    handle.unref()
  }
}

function status(value: GameStatus): void {
  currentStatus = value
  emitGameStatus(value)
}

export async function launchGame(profileId: string): Promise<void> {
  if (child && !child.killed) throw new Error('Игра уже запущена')
  const state = getState()
  const profile = state.profiles.find((entry) => entry.id === profileId)
  if (!profile) throw new Error('Сборка не найдена')

  const versionId = profile.loaderVersionId ?? profile.versionId
  const version = (await readVersionJson(versionId)) ?? (await resolveVersion(versionId))
  const required = requiredJavaMajor(profile.versionId)
  const configuredJava = (profile.javaPath || state.settings.javaPath || '').trim()
  let selectedJava: JavaInfo
  if (configuredJava) {
    const inspected = await inspectJava(configuredJava)
    if (!inspected) {
      throw new Error(`Java не найдена по пути: ${configuredJava}. Укажите корректный путь в настройках.`)
    }
    if (inspected.major < required) {
      throw new Error(`Нужна Java ${required}+, но выбрана Java ${inspected.version} (${configuredJava}).`)
    }
    selectedJava = inspected
  } else {
    const java = await findJava(required)
    if (!java.valid) {
      throw new Error(`Нужна Java ${required}+, найдена: ${java.version}. Укажите путь в настройках.`)
    }
    selectedJava = java
  }
  const javaPath = selectedJava.path

  const clientJar = path.join(versionDir(profile.versionId), `${profile.versionId}.jar`)
  if (!(await fs.pathExists(clientJar))) {
    throw new Error(`Клиент Minecraft ${profile.versionId} не установлен. Нажмите «Установить» или «Проверить файлы».`)
  }

  status('starting')
  emitProgress({
    phase: 'launch',
    message: 'Запуск Minecraft',
    percent: 50,
    current: 0,
    total: 1,
    bytes: 0,
    totalBytes: 0,
    speed: 0
  })

  const directory = instanceDir(profile.id)
  await fs.ensureDir(directory)
  await fs.ensureDir(path.join(directory, 'mods'))

  extractNatives({ ...version, id: version.id })

  const features = { has_custom_resolution: !state.settings.fullscreen }
  const replacements: Record<string, string> = {
    auth_player_name: state.account.name,
    auth_uuid: state.account.uuid,
    auth_access_token: state.account.token,
    auth_session: state.account.token,
    clientid: state.account.uuid,
    auth_xuid: '',
    quickPlayPath: '',
    quickPlaySingleplayer: '',
    quickPlayMultiplayer: '',
    quickPlayRealms: '',
    user_properties: '{}',
    user_type: state.account.type === 'microsoft' ? 'mojang' : 'legacy',
    version_name: version.id,
    version_type: version.type ?? 'release',
    game_directory: directory,
    assets_root: dirs.assets,
    game_assets: path.join(dirs.assets, 'virtual', 'legacy'),
    assets_index_name: version.assetIndex?.id ?? 'legacy',
    natives_directory: path.join(versionDir(version.id), 'natives'),
    launcher_name: 'NeonLauncher',
    launcher_version: '1.0.0',
    classpath_separator: path.delimiter,
    library_directory: dirs.libraries,
    resolution_width: String(state.settings.width),
    resolution_height: String(state.settings.height),
    path: version.logging?.client ? path.join(versionDir(version.id), version.logging.client.file.id) : ''
  }
  const classpath = [
    path.join(versionDir(profile.versionId), `${profile.versionId}.jar`),
    ...classpathLibraries(version)
  ].join(path.delimiter)
  replacements.classpath = classpath

  const substitute = (value: string): string =>
    typeof value === 'string'
      ? value.replace(/\$\{([^}]+)\}/g, (match, key: string) => replacements[key] ?? match)
      : ''

  const jvmArgs: string[] = [
    `-Xmx${profile.memory || state.settings.memory}M`,
    `-Xms${Math.min(profile.memory || state.settings.memory, 512)}M`,
    '-Dfile.encoding=UTF-8',
    ...argValues(version.arguments?.jvm, features).map(substitute)
  ]

  if (!version.arguments?.jvm?.length) {
    jvmArgs.push(`-Djava.library.path=${replacements.natives_directory}`, '-cp', classpath)
  }

  const gameArgs = version.arguments?.game?.length
    ? argValues(version.arguments.game, features).map(substitute)
    : (version.minecraftArguments ?? '').split(/\s+/).filter(Boolean).map(substitute)

  const args = [...jvmArgs, version.mainClass ?? 'net.minecraft.client.main.Main', ...gameArgs]
  emitLog('info', `Java ${selectedJava.version}: ${javaPath}`)
  emitLog('info', `Версия: ${version.id} · Память: ${profile.memory} МБ`)

  child = spawn(javaPath, args, {
    cwd: directory,
    windowsHide: true,
    env: { ...process.env }
  })
  startedAt = Date.now()
  status('running')
  emitProgress({
    phase: 'launch',
    message: 'Игра запущена',
    percent: 100,
    current: 1,
    total: 1,
    bytes: 0,
    totalBytes: 0,
    speed: 0
  })

  const consume = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) emitLog('game', line)
  }
  child.stdout?.on('data', consume)
  child.stderr?.on('data', consume)
  child.on('error', (error) => {
    emitLog('error', error.message)
    status('crashed')
    child = null
  })
  child.on('close', (code) => {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000))
    updateProfile(profile.id, { lastPlayed: Date.now(), playtimeMinutes: profile.playtimeMinutes + minutes })
    emitLog('info', `Игра завершилась с кодом ${code ?? 0}`)
    status(code === 0 ? 'stopped' : 'crashed')
    child = null
  })
}
