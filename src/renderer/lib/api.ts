import type {
  AppState,
  GameStatus,
  JavaInfo,
  LauncherAPI,
  LogPayload,
  ModInfo,
  ModrinthProject,
  ProgressPayload,
  Profile,
  ToastPayload,
  VersionManifest
} from '@shared/types'

declare global {
  interface Window {
    launcher?: LauncherAPI
  }
}

type Handler<T> = (payload: T) => void

const mockVersions = {
  latest: { release: '1.21.4', snapshot: '25w02a' },
  versions: [
    { id: '1.21.4', type: 'release', released: '2024-12-10T12:00:00+00:00' },
    { id: '1.21.1', type: 'release', released: '2024-08-08T12:00:00+00:00' },
    { id: '1.20.6', type: 'release', released: '2024-05-22T12:00:00+00:00' },
    { id: '1.20.4', type: 'release', released: '2023-12-19T12:00:00+00:00' },
    { id: '1.20.1', type: 'release', released: '2023-06-07T12:00:00+00:00' },
    { id: '1.19.4', type: 'release', released: '2023-03-15T12:00:00+00:00' },
    { id: '1.18.2', type: 'release', released: '2022-02-28T12:00:00+00:00' },
    { id: '1.16.5', type: 'release', released: '2021-01-20T12:00:00+00:00' },
    { id: '1.12.2', type: 'release', released: '2017-09-18T12:00:00+00:00' }
  ]
} as unknown as VersionManifest

const mockMods: ModInfo[] = [
  { fileName: 'jei-1.20.1-fabric-15.2.0.jar', name: 'Just Enough Items', version: '15.2.0', description: 'Просмотр рецептов и предметов', loader: 'fabric', enabled: true, size: 3_200_000 },
  { fileName: 'sodium-fabric-mc1.20.1-0.5.3.jar', name: 'Sodium', version: '0.5.3', description: 'Оптимизация производительности', loader: 'fabric', enabled: true, size: 1_800_000 },
  { fileName: 'iris-mc1.20.1-1.6.4.jar', name: 'Iris Shaders', version: '1.6.4', description: 'Шейдеры для Fabric', loader: 'fabric', enabled: true, size: 2_400_000 },
  { fileName: 'journeymap-1.20.1.jar', name: 'JourneyMap', version: '5.9.0', description: 'Интерактивная карта', loader: 'fabric', enabled: false, size: 8_100_000 }
]

const icon = (letter: string, color: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="22" fill="${color}"/><text x="48" y="62" font-family="sans-serif" font-size="44" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`)}`

const mockProjects: ModrinthProject[] = [
  { project_id: 'sodium', slug: 'sodium', title: 'Sodium', description: 'Мощный движок рендеринга, который радикально повышает производительность Minecraft.', icon_url: icon('S', '#16a34a'), downloads: 82_400_000, follow_count: 12_000, categories: ['fabric', 'optimization'] },
  { project_id: 'iris', slug: 'iris', title: 'Iris Shaders', description: 'Современный загрузчик шейдеров с поддержкой Fabric и Forge.', icon_url: icon('I', '#7c3aed'), downloads: 41_200_000, follow_count: 8_400, categories: ['fabric', 'shaders'] },
  { project_id: 'jei', slug: 'jei', title: 'Just Enough Items', description: 'Просмотр рецептов и предметов — незаменимый мод для любого модпака.', icon_url: icon('J', '#0ea5e9'), downloads: 96_000_000, follow_count: 15_300, categories: ['fabric', 'utility'] },
  { project_id: 'journeymap', slug: 'journeymap', title: 'JourneyMap', description: 'Красивая интерактивная карта мира в реальном времени.', icon_url: icon('J', '#f59e0b'), downloads: 22_700_000, follow_count: 5_100, categories: ['fabric', 'map'] },
  { project_id: 'reverb', slug: 'reverb', title: 'Reverb', description: 'Оптимизация звуковой системы и корректная работа аудио в мирах.', icon_url: icon('R', '#ec4899'), downloads: 3_100_000, follow_count: 900, categories: ['fabric', 'optimization'] },
  { project_id: 'lithium', slug: 'lithium', title: 'Lithium', description: 'Общие оптимизации игровой логики без изменения геймплея.', icon_url: icon('L', '#14b8a6'), downloads: 37_500_000, follow_count: 6_200, categories: ['fabric', 'optimization'] }
]

function mockState(): AppState {
  const now = Date.now()
  return {
    profiles: [
      { id: 'default', name: 'Мой Minecraft', versionId: '1.20.1', loader: 'fabric', memory: 2048, createdAt: now - 8_640_000_00, lastPlayed: now - 3_600_000, playtimeMinutes: 184, loaderVersionId: 'fabric-loader-0.15.11-1.20.1' },
      { id: 'adventuria', name: 'Adventuria', versionId: '1.20.1', loader: 'forge', memory: 4096, createdAt: now - 1_728_000_00, lastPlayed: now - 86_400_000, playtimeMinutes: 512, modpack: { name: 'Adventuria', version: '3.2.1', source: 'mrpack' } }
    ],
    selectedProfileId: 'default',
    settings: { javaPath: '', memory: 2048, width: 1280, height: 720, fullscreen: false, language: 'ru', closeBehavior: 'exit', checkUpdates: true },
    account: { name: 'Steve', uuid: '00000000-0000-0000-0000-000000000000', token: 'mock', type: 'offline' },
    installedVersions: ['1.20.1', 'fabric-loader-0.15.11-1.20.1']
  }
}

type MockBus = {
  progress: Handler<ProgressPayload>[]
  log: Handler<LogPayload>[]
  gameStatus: Handler<GameStatus>[]
  toast: Handler<ToastPayload>[]
}

const bus: MockBus = { progress: [], log: [], gameStatus: [], toast: [] }
function emit<K extends keyof MockBus>(key: K, payload: Parameters<MockBus[K][number]>[0]): void {
  for (const handler of bus[key]) handler(payload as never)
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function mockProgress(label: string, phase: ProgressPayload['phase']): Promise<void> {
  let value = 0
  const total = 100
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      value += 4 + Math.random() * 9
      emit('progress', {
        phase,
        message: `${label} · ${Math.min(total, Math.round(value))}%`,
        percent: Math.min(100, value),
        current: Math.round(value),
        total,
        bytes: Math.round(value * 1_200_000),
        totalBytes: total * 1_200_000,
        speed: 24_000_000 + Math.random() * 8_000_000
      })
      if (value >= total) {
        clearInterval(timer)
        setTimeout(resolve, 200)
      }
    }, 90)
  })
}

function createMock(): LauncherAPI {
  let state = mockState()
  let status: GameStatus = 'idle'
  let logs: LogPayload[] = []
  let mods = [...mockMods]

  const api: LauncherAPI = {
    isMock: true,
    getState: async () => state,
    setState: async (patch) => {
      state = { ...state, ...patch }
      return state
    },
    setAccount: async (name) => {
      state = { ...state, account: { ...state.account, name } }
      return state
    },
    createProfile: async (profile) => {
      state = { ...state, profiles: [...state.profiles, profile], selectedProfileId: profile.id }
      return state
    },
    updateProfile: async (id, patch) => {
      state = { ...state, profiles: state.profiles.map((profile) => (profile.id === id ? { ...profile, ...patch } : profile)) }
      return state
    },
    deleteProfile: async (id) => {
      const profiles = state.profiles.filter((profile) => profile.id !== id)
      state = { ...state, profiles, selectedProfileId: profiles[0]?.id ?? '' }
      return state
    },
    getVersions: async () => mockVersions,
    installProfile: async () => {
      await mockProgress('Подготовка клиента', 'version')
      await mockProgress('Библиотеки', 'libraries')
      await mockProgress('Ассеты', 'assets')
      emit('toast', { id: String(Date.now()), type: 'success', message: 'Версия установлена (демо-режим)' })
    },
    launch: async () => {
      status = 'starting'
      emit('gameStatus', status)
      await wait(800)
      status = 'running'
      emit('gameStatus', status)
      emit('log', { level: 'game', message: '[info] Демо-режим: игра не запускается по-настоящему', time: Date.now() })
      emit('log', { level: 'game', message: '[info] Переключитесь на Electron-приложение для реального запуска', time: Date.now() })
    },
    stopGame: async () => {
      status = 'stopped'
      emit('gameStatus', status)
    },
    getGameStatus: async () => status,
    listMods: async () => mods,
    installLocalMod: async () => {
      await mockProgress('Установка мода', 'mod')
      mods = [...mods, { fileName: 'new-mod.jar', name: 'Новый мод', version: '1.0.0', loader: 'fabric', enabled: true, size: 1_200_000 }]
    },
    installModFile: async () => undefined,
    toggleMod: async (profileId, fileName) => {
      mods = mods.map((mod) => (mod.fileName === fileName ? { ...mod, enabled: !mod.enabled } : mod))
    },
    deleteMod: async (profileId, fileName) => {
      mods = mods.filter((mod) => mod.fileName !== fileName)
    },
    searchMods: async (query) => {
      await wait(260)
      const normalized = query.trim().toLowerCase()
      return normalized ? mockProjects.filter((project) => `${project.title} ${project.description}`.toLowerCase().includes(normalized)) : mockProjects
    },
    installMod: async (id, projectId) => {
      const project = mockProjects.find((entry) => entry.project_id === projectId)
      await mockProgress(`Установка ${project?.title ?? 'мода'}`, 'mod')
      mods = [...mods, { fileName: `${projectId}-1.0.0.jar`, name: project?.title ?? projectId, version: '1.0.0', loader: 'fabric', enabled: true, size: 2_000_000 }]
      emit('toast', { id: String(Date.now()), type: 'success', message: `${project?.title ?? 'Мод'} установлен` })
    },
    searchModpacks: async (query) => {
      await wait(220)
      const packs = [
        { project_id: 'adventuria', slug: 'adventuria', title: 'Adventuria', description: 'Большое приключение с магией, research и исследованием мира.', icon_url: icon('A', '#059669'), downloads: 2_400_000, follow_count: 12_000, categories: ['forge'], project_type: 'modpack' },
        { project_id: 'create-astral', slug: 'create-astral', title: 'Create: Astral', description: 'Инженерный модпак с автоматизацией и космосом.', icon_url: icon('C', '#2563eb'), downloads: 1_800_000, follow_count: 9_300, categories: ['fabric'], project_type: 'modpack' },
        { project_id: 'vl-reforged', slug: 'vl-reforged', title: 'Vault Hunters Reforged', description: 'Модпак с подземельями, задачами и RPG-прогрессией.', icon_url: icon('V', '#dc2626'), downloads: 3_600_000, follow_count: 18_000, categories: ['forge'], project_type: 'modpack' }
      ]
      const normalized = query.trim().toLowerCase()
      return normalized ? packs.filter((pack) => `${pack.title} ${pack.description}`.toLowerCase().includes(normalized)) : packs
    },
    installModpack: async () => {
      await mockProgress('Установка сборки', 'modpack')
    },
    installModpackFilePath: async () => {
      await mockProgress('Установка сборки', 'modpack')
    },
    installModpackFromModrinth: async (profileId, projectId) => {
      await mockProgress('Скачивание сборки', 'modpack')
      await mockProgress('Установка модов', 'mod',)
      emit('toast', { id: String(Date.now()), type: 'success', message: 'Сборка установлена (демо-режим)' })
    },
    windowAction: async () => undefined,
    getJavaInfo: async (): Promise<JavaInfo> => ({ path: '/usr/lib/jvm/java-17-openjdk/bin/java', version: '17.0.12', major: 17, valid: true }),
    detectJava: async (): Promise<JavaInfo> => ({ path: '/usr/lib/jvm/java-17-openjdk/bin/java', version: '17.0.12', major: 17, valid: true }),
    openFolder: async () => undefined,
    getLogs: async () => logs,
    clearLogs: async () => {
      logs = []
    },
    onProgress: (cb) => {
      bus.progress.push(cb)
      return () => {
        bus.progress = bus.progress.filter((handler) => handler !== cb)
      }
    },
    onLog: (cb) => {
      bus.log.push(cb)
      return () => {
        bus.log = bus.log.filter((handler) => handler !== cb)
      }
    },
    onGameStatus: (cb) => {
      bus.gameStatus.push(cb)
      return () => {
        bus.gameStatus = bus.gameStatus.filter((handler) => handler !== cb)
      }
    },
    onToast: (cb) => {
      bus.toast.push(cb)
      return () => {
        bus.toast = bus.toast.filter((handler) => handler !== cb)
      }
    }
  }
  return api
}

export const api: LauncherAPI = window.launcher ?? createMock()
export const isMock = api.isMock
