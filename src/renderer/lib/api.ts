import { t } from './i18n'
import type {
  AppState,
  BackupInfo,
  GameStatus,
  JavaInfo,
  LauncherAPI,
  LogPayload,
  ModInfo,
  ModUpdateInfo,
  ModrinthProject,
  ModrinthProjectDetails,
  PackInfo,
  PackKind,
  ProgressPayload,
  Profile,
  ScreenshotInfo,
  SkinInfo,
  ToastPayload,
  UpdateInfo,
  VerifyReport,
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
    { id: '25w02a', type: 'snapshot', released: '2025-01-08T12:00:00+00:00' },
    { id: '24w40a', type: 'snapshot', released: '2024-10-02T12:00:00+00:00' },
    { id: '1.21.4', type: 'release', released: '2024-12-10T12:00:00+00:00' },
    { id: '1.21.1', type: 'release', released: '2024-08-08T12:00:00+00:00' },
    { id: '1.20.6', type: 'release', released: '2024-05-22T12:00:00+00:00' },
    { id: '1.20.4', type: 'release', released: '2023-12-19T12:00:00+00:00' },
    { id: '1.20.1', type: 'release', released: '2023-06-07T12:00:00+00:00' },
    { id: '1.19.4', type: 'release', released: '2023-03-15T12:00:00+00:00' },
    { id: '1.18.2', type: 'release', released: '2022-02-28T12:00:00+00:00' },
    { id: '1.16.5', type: 'release', released: '2021-01-20T12:00:00+00:00' },
    { id: '1.12.2', type: 'release', released: '2017-09-18T12:00:00+00:00' },
    { id: 'b1.8.1', type: 'old_beta', released: '2011-04-19T12:00:00+00:00' },
    { id: 'b1.7.3', type: 'old_beta', released: '2011-01-21T12:00:00+00:00' },
    { id: 'a1.2.6', type: 'old_alpha', released: '2010-08-20T12:00:00+00:00' }
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
  { project_id: 'sodium', slug: 'sodium', title: 'Sodium', description: 'Мощный движок рендеринга, который радикально повышает производительность Minecraft.', icon_url: icon('S', '#16a34a'), downloads: 82_400_000, follow_count: 12_000, categories: ['fabric', 'optimization'], versions: ['1.21.4', '1.20.1', '1.19.4'] },
  { project_id: 'iris', slug: 'iris', title: 'Iris Shaders', description: 'Современный загрузчик шейдеров с поддержкой Fabric и Forge.', icon_url: icon('I', '#7c3aed'), downloads: 41_200_000, follow_count: 8_400, categories: ['fabric', 'forge', 'shaders'], versions: ['1.21.4', '1.20.1'] },
  { project_id: 'jei', slug: 'jei', title: 'Just Enough Items', description: 'Просмотр рецептов и предметов — незаменимый мод для любого модпака.', icon_url: icon('J', '#0ea5e9'), downloads: 96_000_000, follow_count: 15_300, categories: ['fabric', 'forge', 'utility'], versions: ['1.21.4', '1.20.1', '1.18.2'] },
  { project_id: 'journeymap', slug: 'journeymap', title: 'JourneyMap', description: 'Красивая интерактивная карта мира в реальном времени.', icon_url: icon('J', '#f59e0b'), downloads: 22_700_000, follow_count: 5_100, categories: ['fabric', 'forge', 'map'], versions: ['1.20.1', '1.16.5'] },
  { project_id: 'reverb', slug: 'reverb', title: 'Reverb', description: 'Оптимизация звуковой системы и корректная работа аудио в мирах.', icon_url: icon('R', '#ec4899'), downloads: 3_100_000, follow_count: 900, categories: ['fabric', 'optimization'], versions: ['1.20.1'] },
  { project_id: 'lithium', slug: 'lithium', title: 'Lithium', description: 'Общие оптимизации игровой логики без изменения геймплея.', icon_url: icon('L', '#14b8a6'), downloads: 37_500_000, follow_count: 6_200, categories: ['fabric', 'optimization'], versions: ['1.21.4', '1.20.1'] },
  { project_id: 'fabric-api', slug: 'fabric-api', title: 'Fabric API', description: 'Базовая библиотека, необходимая большинству модов Fabric.', icon_url: icon('F', '#dc2626'), downloads: 210_000_000, follow_count: 30_000, categories: ['fabric', 'library'], versions: ['1.21.4', '1.20.1', '1.19.4'] },
  { project_id: 'shaderc', slug: 'shaderc', title: 'Sodium Extra', description: 'Дополнительные настройки графики и отладки для Sodium.', icon_url: icon('E', '#0d9488'), downloads: 12_400_000, follow_count: 2_800, categories: ['fabric', 'optimization'], versions: ['1.20.1'] },
  { project_id: 'indium', slug: 'indium', title: 'Indium', description: 'Слой совместимости Sodium и Fabric Rendering API.', icon_url: icon('In', '#6366f1'), downloads: 9_800_000, follow_count: 2_100, categories: ['fabric', 'optimization'], versions: ['1.20.1'] },
  { project_id: 'emi', slug: 'emi', title: 'EMI', description: 'Современный просмотр рецептов с быстрым поиском.', icon_url: icon('Em', '#f97316'), downloads: 18_600_000, follow_count: 4_400, categories: ['fabric', 'forge', 'utility'], versions: ['1.21.4', '1.20.1'] },
  { project_id: 'waila', slug: 'waila', title: 'WTHIT', description: 'Подсказки о блоках и существах под прицелом.', icon_url: icon('W', '#8b5cf6'), downloads: 14_200_000, follow_count: 3_600, categories: ['fabric', 'forge', 'utility'], versions: ['1.20.1', '1.18.2'] },
  { project_id: 'jade', slug: 'jade', title: 'Jade', description: 'Информативный оверлей о блоках, мобах и их состоянии.', icon_url: icon('Ja', '#22c55e'), downloads: 11_900_000, follow_count: 2_900, categories: ['fabric', 'forge', 'utility'], versions: ['1.21.4', '1.20.1'] },
  { project_id: 'treechopper', slug: 'treechopper', title: 'Tree Chopper', description: 'Срубите дерево одним ударом — никаких лишних блоков.', icon_url: icon('T', '#65a30d'), downloads: 5_600_000, follow_count: 1_200, categories: ['fabric', 'forge', 'utility'], versions: ['1.20.1'] },
  { project_id: 'inventory-hud', slug: 'inventory-hud', title: 'Inventory HUD+', description: 'Отображение содержимого рюкзака, экипировки и контейнеров.', icon_url: icon('IH', '#0891b2'), downloads: 4_300_000, follow_count: 980, categories: ['fabric', 'forge', 'utility'], versions: ['1.20.1'] },
  { project_id: 'roughly-enough-items', slug: 'roughly-enough-items', title: 'Roughly Enough Items', description: 'Лёгкий просмотр рецептов для Forge и NeoForge.', icon_url: icon('REI', '#e11d48'), downloads: 28_700_000, follow_count: 6_800, categories: ['forge', 'neoforge', 'utility'], versions: ['1.20.1', '1.19.4'] },
  { project_id: 'architectury', slug: 'architectury', title: 'Architectury API', description: 'Общий слой для модов, работающих на Forge и Fabric.', icon_url: icon('A', '#7c3aed'), downloads: 19_300_000, follow_count: 3_900, categories: ['forge', 'fabric', 'library'], versions: ['1.20.1'] },
  { project_id: 'ftb-quests', slug: 'ftb-quests', title: 'FTB Quests', description: 'Система заданий и прогресса для модпаков.', icon_url: icon('Q', '#f59e0b'), downloads: 16_800_000, follow_count: 5_400, categories: ['forge', 'fabric', 'utility'], versions: ['1.20.1'] },
  { project_id: 'twilight-forest', slug: 'twilight-forest', title: 'Twilight Forest', description: 'Новое измерение с биомами, боссами и приключениями.', icon_url: icon('TF', '#15803d'), downloads: 24_100_000, follow_count: 7_200, categories: ['forge', 'fabric', 'adventure'], versions: ['1.20.1', '1.18.2'] },
  { project_id: 'botania', slug: 'botania', title: 'Botania', description: 'Магия цветов: генерация ресурсов и артефакты.', icon_url: icon('B', '#db2777'), downloads: 21_500_000, follow_count: 6_100, categories: ['forge', 'fabric', 'magic'], versions: ['1.20.1'] },
  { project_id: 'create', slug: 'create', title: 'Create', description: 'Механики и автоматизация с красивыми машинами.', icon_url: icon('C', '#b45309'), downloads: 33_900_000, follow_count: 9_700, categories: ['forge', 'fabric', 'utility'], versions: ['1.20.1', '1.18.2'] },
  { project_id: 'computercraft', slug: 'cc-tweaked', title: 'CC: Tweaked', description: 'Программируемые компьютеры и роботы внутри игры.', icon_url: icon('CC', '#334155'), downloads: 13_700_000, follow_count: 3_300, categories: ['forge', 'fabric', 'utility'], versions: ['1.20.1'] },
  { project_id: 'xaeros-minimap', slug: 'xaeros-minimap', title: 'Xaero’s Minimap', description: 'Мини-карта и карта мира с поддержкой серверов.', icon_url: icon('X', '#2563eb'), downloads: 47_200_000, follow_count: 10_400, categories: ['forge', 'fabric', 'map'], versions: ['1.21.4', '1.20.1'] },
  { project_id: 'iron-chests', slug: 'iron-chests', title: 'Iron Chests', description: 'Улучшенные сундуки и хранилища для модпаков.', icon_url: icon('IC', '#64748b'), downloads: 8_400_000, follow_count: 1_900, categories: ['forge', 'fabric', 'utility'], versions: ['1.20.1'] },
  { project_id: 'applied-energistics', slug: 'applied-energistics-2', title: 'Applied Energistics 2', description: 'Цифровое хранение предметов и автозаводы ME-систем.', icon_url: icon('AE', '#0891b2'), downloads: 26_300_000, follow_count: 8_100, categories: ['forge', 'fabric', 'utility'], versions: ['1.20.1'] },
  { project_id: 'thermal-series', slug: 'thermal-series', title: 'Thermal Series', description: 'Модульная индустриализация: энергия, генераторы и машины.', icon_url: icon('TS', '#dc2626'), downloads: 19_800_000, follow_count: 4_700, categories: ['forge', 'fabric', 'utility'], versions: ['1.20.1'] }
]

function screenshotImage(title: string, color: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#0b1020"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><rect y="250" width="640" height="110" fill="#2f5d34"/><circle cx="520" cy="80" r="34" fill="#fde68a" opacity="0.8"/><text x="32" y="52" font-family="sans-serif" font-size="30" font-weight="700" fill="#fff">${title}</text><text x="32" y="86" font-family="sans-serif" font-size="18" fill="#e2e8f0">Minecraft · Lumen Launcher</text></svg>`)}`
}

const mockScreenshots: ScreenshotInfo[] = [
  { fileName: '2026-11-18_12.34.20.png', profileId: 'default', profileName: 'Мой Minecraft', name: '2026-11-18_12.34.20', size: 842_000, createdAt: Date.now() - 3_600_000, dataUrl: screenshotImage('Дом на холме', '#1e3a8a') },
  { fileName: '2026-11-17_19.02.41.png', profileId: 'default', profileName: 'Мой Minecraft', name: '2026-11-17_19.02.41', size: 1_240_000, createdAt: Date.now() - 86_400_000, dataUrl: screenshotImage('Закат в пустыне', '#9a3412') },
  { fileName: '2026-11-16_14.15.08.png', profileId: 'default', profileName: 'Мой Minecraft', name: '2026-11-16_14.15.08', size: 960_000, createdAt: Date.now() - 172_800_000, dataUrl: screenshotImage('Подземная база', '#312e81') },
  { fileName: '2026-11-15_21.40.12.png', profileId: 'adventuria', profileName: 'Adventuria', name: '2026-11-15_21.40.12', size: 1_560_000, createdAt: Date.now() - 259_200_000, dataUrl: screenshotImage('Башня магов', '#4c1d95') }
]

function skinPreview(shirt: string, hair: string): string {
  const skin = '#f1c27d'
  const pants = '#2f3a51'
  const shoe = '#1f2937'
  const rect = (x: number, y: number, w: number, h: number, fill: string) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`

  // A minimal 64×64 texture laid out like a real Minecraft skin so the 3D
  // preview can sample the same UV regions as imported PNG skins.
  const pixels = [
    // Head: top/bottom, then right/front/left/back with hair strips.
    rect(8, 0, 8, 8, hair), rect(16, 0, 8, 8, skin),
    rect(0, 8, 8, 8, skin), rect(8, 8, 8, 8, skin), rect(16, 8, 8, 8, skin), rect(24, 8, 8, 8, skin),
    rect(8, 8, 8, 2, hair), rect(0, 8, 8, 2, hair), rect(16, 8, 8, 2, hair), rect(24, 8, 8, 2, hair),
    rect(10, 11, 1, 1, '#ffffff'), rect(13, 11, 1, 1, '#ffffff'),
    rect(10, 12, 1, 1, '#3b2b22'), rect(13, 12, 1, 1, '#3b2b22'),
    rect(11, 14, 2, 1, '#9a6245'),

    // Torso.
    rect(20, 16, 8, 4, shirt), rect(24, 16, 8, 4, pants),
    rect(16, 20, 4, 12, shirt), rect(20, 20, 8, 12, shirt),
    rect(36, 20, 4, 12, shirt), rect(32, 20, 8, 12, shirt),

    // Right arm.
    rect(44, 16, 4, 4, shirt), rect(48, 16, 4, 4, skin),
    rect(40, 20, 4, 12, shirt), rect(44, 20, 4, 10, shirt), rect(44, 30, 4, 2, skin),
    rect(48, 20, 4, 12, shirt), rect(52, 20, 4, 10, shirt), rect(52, 30, 4, 2, skin),

    // Left arm.
    rect(36, 48, 4, 4, shirt), rect(40, 48, 4, 4, skin),
    rect(52, 48, 4, 12, shirt), rect(36, 52, 4, 10, shirt), rect(36, 62, 4, 2, skin),
    rect(44, 52, 4, 12, shirt), rect(48, 52, 4, 10, shirt), rect(48, 62, 4, 2, skin),

    // Right leg.
    rect(4, 16, 4, 4, pants), rect(8, 16, 4, 4, shoe),
    rect(0, 20, 4, 12, pants), rect(4, 20, 4, 10, pants), rect(4, 30, 4, 2, shoe),
    rect(8, 20, 4, 12, pants), rect(12, 20, 4, 10, pants), rect(12, 30, 4, 2, shoe),

    // Left leg.
    rect(20, 48, 4, 4, pants), rect(24, 48, 4, 4, shoe),
    rect(16, 52, 4, 12, pants), rect(20, 52, 4, 10, pants), rect(20, 62, 4, 2, shoe),
    rect(24, 52, 4, 12, pants), rect(28, 52, 4, 10, pants), rect(28, 62, 4, 2, shoe)
  ].join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" shape-rendering="crispEdges">${pixels}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const mockSkins: SkinInfo[] = [
  { id: 'skin-steve', name: 'Steve', model: 'wide', dataUrl: skinPreview('#3b82f6', '#6b4f2a'), size: 4213, addedAt: Date.now() - 86_400_000, active: false },
  { id: 'skin-alex', name: 'Alex', model: 'slim', dataUrl: skinPreview('#ec4899', '#1d4ed8'), size: 3980, addedAt: Date.now() - 172_800_000, active: false }
]

function mockState(): AppState {
  const now = Date.now()
  return {
    schemaVersion: 2,
    profiles: [
      { id: 'default', name: 'Мой Minecraft', versionId: '1.20.1', loader: 'fabric', groupId: 'survival', createdAt: now - 8_640_000_00, lastPlayed: now - 3_600_000, playtimeMinutes: 184, loaderVersionId: 'fabric-loader-0.15.11-1.20.1' },
      { id: 'adventuria', name: 'Adventuria', versionId: '1.20.1', loader: 'forge', groupId: 'modpacks', createdAt: now - 1_728_000_00, lastPlayed: now - 86_400_000, playtimeMinutes: 512, modpack: { name: 'Adventuria', version: '3.2.1', source: 'mrpack' } }
    ],
    groups: [
      { id: 'survival', name: 'Выживание' },
      { id: 'modpacks', name: 'Модпаки' }
    ],
    selectedProfileId: 'default',
    settings: { javaPath: '', memory: 2048, width: 1280, height: 720, fullscreen: false, language: 'ru', closeBehavior: 'exit', checkUpdates: true, instancesView: 'grid', autoBackupBeforeUpdates: true, autoInstallJava: true },
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
  let screenshots = [...mockScreenshots]
  let skins: SkinInfo[] = mockSkins.map((skin) => ({ ...skin, active: skin.id === state.settings.activeSkinId }))
  const backupsByProfile: Record<string, BackupInfo[]> = {}
  const packsByProfile: Record<string, PackInfo[]> = {
    default: [
      { fileName: 'faithful-32x.zip', name: 'Faithful 32x', kind: 'resource', enabled: true, size: 8_400_000 },
      { fileName: 'complementary.zip', name: 'Complementary Shaders', kind: 'shader', enabled: false, size: 2_100_000 }
    ]
  }
  const modsByProfile: Record<string, ModInfo[]> = {
    default: [...mockMods],
    adventuria: [mockMods[1], mockMods[2]]
  }
  const modsFor = (profileId: string): ModInfo[] => {
    if (!modsByProfile[profileId]) modsByProfile[profileId] = []
    return modsByProfile[profileId]
  }

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
      screenshots = screenshots.filter((shot) => shot.profileId !== id)
      state = { ...state, profiles, selectedProfileId: profiles[0]?.id ?? '' }
      return state
    },
    confirmDeleteProfile: async (id) => {
      const profile = state.profiles.find((entry) => entry.id === id)
      if (!profile) return false
      const shots = screenshots.filter((shot) => shot.profileId === id).length
      return window.confirm([
        t('Удалить сборку «{name}»?', { name: profile.name }),
        '',
        t('Безвозвратно удалятся:'),
        t('• миры (saves)'),
        t('• моды (mods)'),
        t('• скриншоты (screenshots)'),
        t('• конфиги, ресурс- и шейдерпаки, options.txt'),
        t('• журналы и отчёты об ошибках'),
        t('• запись о сборке в лаунчере'),
        '',
        t('Скриншотов в сборке: {count}', { count: shots }),
        t('Путь: {path}', { path: `<launcher>/instances/${id}` }),
        '',
        t('Отменить это действие нельзя.')
      ].join('\n'))
    },
    getVersions: async () => mockVersions,
    installProfile: async (id) => {
      await mockProgress(t('Подготовка клиента'), 'version')
      await mockProgress(t('Библиотеки'), 'libraries')
      await mockProgress(t('Ассеты'), 'assets')
      const profile = state.profiles.find((entry) => entry.id === id)
      const loaderVersionId = profile && profile.loader !== 'vanilla'
        ? `${profile.loader}-loader-0.15.11-${profile.versionId}`
        : undefined
      const installed = new Set(state.installedVersions)
      if (profile) installed.add(profile.versionId)
      if (loaderVersionId) installed.add(loaderVersionId)
      state = {
        ...state,
        installedVersions: [...installed],
        profiles: state.profiles.map((entry) => (entry.id === id ? { ...entry, loaderVersionId } : entry))
      }
      emit('toast', { id: String(Date.now()), type: 'success', message: t('Версия установлена (демо-режим)') })
    },
    launch: async () => {
      status = 'starting'
      emit('gameStatus', status)
      await wait(800)
      status = 'running'
      emit('gameStatus', status)
      emit('log', { level: 'game', message: t('[info] Демо-режим: игра не запускается по-настоящему'), time: Date.now() })
      emit('log', { level: 'game', message: t('[info] Переключитесь на Electron-приложение для реального запуска'), time: Date.now() })
    },
    stopGame: async () => {
      status = 'stopped'
      emit('gameStatus', status)
    },
    getGameStatus: async () => status,
    listMods: async (profileId) => [...modsFor(profileId)],
    installLocalMod: async (profileId) => {
      await mockProgress(t('Установка мода'), 'mod')
      modsByProfile[profileId] = [
        ...modsFor(profileId),
        { fileName: `local-mod-${Date.now()}.jar`, name: t('Новый мод'), version: '1.0.0', loader: 'fabric', enabled: true, size: 1_200_000 }
      ]
    },
    installModFile: async () => undefined,
    toggleMod: async (profileId, fileName) => {
      modsByProfile[profileId] = modsFor(profileId).map((mod) => (mod.fileName === fileName ? { ...mod, enabled: !mod.enabled } : mod))
    },
    deleteMod: async (profileId, fileName) => {
      modsByProfile[profileId] = modsFor(profileId).filter((mod) => mod.fileName !== fileName)
    },
    searchMods: async (query, gameVersion, loader, offset = 0) => {
      await wait(260)
      const normalized = query.trim().toLowerCase()
      let result = mockProjects
      if (normalized) {
        result = result.filter((project) =>
          `${project.title} ${project.description} ${project.categories.join(' ')}`.toLowerCase().includes(normalized)
        )
      }
      if (gameVersion) result = result.filter((project) => project.versions?.includes(gameVersion))
      if (loader && loader !== 'vanilla') result = result.filter((project) => project.categories.includes(loader))
      return result.slice(offset, offset + 24)
    },
    installMod: async (id, projectId) => {
      const project = mockProjects.find((entry) => entry.project_id === projectId)
      await mockProgress(t('Установка {name}', { name: project?.title ?? t('мод') }), 'mod')
      modsByProfile[id] = [
        ...modsFor(id),
        { fileName: `${projectId}-1.0.0-${Date.now()}.jar`, name: project?.title ?? projectId, version: '1.0.0', loader: 'fabric', enabled: true, size: 2_000_000 }
      ]
      emit('toast', { id: String(Date.now()), type: 'success', message: t('{name} установлен', { name: project?.title ?? t('Мод') }) })
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
    getProjectDetails: async (projectId): Promise<ModrinthProjectDetails> => {
      await wait(220)
      const base = mockProjects.find((project) => project.project_id === projectId)
      const pack = !base ? [
        { project_id: 'adventuria', slug: 'adventuria', title: 'Adventuria', description: 'Большое приключение с магией, research и исследованием мира.', icon_url: icon('A', '#059669'), downloads: 2_400_000, follow_count: 12_000, categories: ['forge'], project_type: 'modpack', versions: ['1.20.1'] },
        { project_id: 'create-astral', slug: 'create-astral', title: 'Create: Astral', description: 'Инженерный модпак с автоматизацией и космосом.', icon_url: icon('C', '#2563eb'), downloads: 1_800_000, follow_count: 9_300, categories: ['fabric'], project_type: 'modpack', versions: ['1.20.1'] },
        { project_id: 'vl-reforged', slug: 'vl-reforged', title: 'Vault Hunters Reforged', description: 'Модпак с подземельями, задачами и RPG-прогрессией.', icon_url: icon('V', '#dc2626'), downloads: 3_600_000, follow_count: 18_000, categories: ['forge'], project_type: 'modpack', versions: ['1.20.1'] }
      ].find((item) => item.project_id === projectId) : null
      const project = base ?? pack
      if (!project) throw new Error(t('Проект не найден'))
      return {
        ...project,
        body: [
          '## ' + t('О проекте'),
          '',
          t(project.description),
          '',
          '### ' + t('Возможности'),
          '- ' + t('Подробное описание и скриншоты прямо в лаунчере'),
          '- ' + t('Быстрая установка в выбранную сборку'),
          '- ' + t('Совместимость и версии отображаются в панели деталей'),
          '',
          '### ' + t('Примечание'),
          t('Это демонстрационные данные, показанные в режиме предпросмотра.')
        ].join('\n'),
        gallery: [
          { url: screenshotImage(project.title, '#1e3a8a'), featured: true, title: t('Главный экран'), description: t(project.description), ordering: 0 },
          { url: screenshotImage(t('{name} · Мир', { name: project.title }), '#312e81'), featured: false, title: t('Игровой процесс'), description: t('Пример скриншота проекта'), ordering: 1 },
          { url: screenshotImage(t('{name} · Детали', { name: project.title }), '#065f46'), featured: false, title: t('Интерфейс'), description: t('Дополнительный вид'), ordering: 2 }
        ],
        game_versions: project.versions ?? ['1.21.4', '1.20.1', '1.19.4'],
        loaders: project.categories.filter((category) => ['fabric', 'forge', 'neoforge', 'quilt'].includes(category)),
        source_url: 'https://example.com/source',
        issues_url: 'https://example.com/issues',
        wiki_url: 'https://example.com/wiki'
      }
    },
    installModpack: async () => {
      await mockProgress(t('Установка модпака'), 'modpack')
    },
    installModpackFilePath: async () => {
      await mockProgress(t('Установка модпака'), 'modpack')
    },
    installModpackFromModrinth: async (profileId, projectId) => {
      await mockProgress(t('Скачивание модпака'), 'modpack')
      await mockProgress(t('Установка модов'), 'mod')
      emit('toast', { id: String(Date.now()), type: 'success', message: t('Модпак установлен (демо-режим)') })
    },
    listScreenshots: async (profileId) => {
      const result = profileId ? screenshots.filter((shot) => shot.profileId === profileId) : screenshots
      return [...result].sort((a, b) => b.createdAt - a.createdAt)
    },
    deleteScreenshot: async (profileId, fileName) => {
      screenshots = screenshots.filter((shot) => !(shot.profileId === profileId && shot.fileName === fileName))
    },
    windowAction: async () => undefined,
    getJavaInfo: async (): Promise<JavaInfo> => ({ path: '/usr/lib/jvm/java-17-openjdk/bin/java', version: '17.0.12', major: 17, valid: true }),
    detectJava: async (): Promise<JavaInfo> => ({ path: '/usr/lib/jvm/java-17-openjdk/bin/java', version: '17.0.12', major: 17, valid: true }),
    ensureJava: async (major = 17, profileId, explicit): Promise<JavaInfo> => {
      if (!explicit && state.settings.autoInstallJava === false) {
        throw new Error(t('Требуется Java {major} или новее', { major }))
      }
      await mockProgress(t('Загрузка Java {version}...', { version: major }), 'java')
      const info: JavaInfo = {
        path: `${state.settings.javaPath || '/usr/lib/jvm'}/java-${major}/bin/java`,
        version: `${major}.0.12`,
        major,
        valid: true
      }
      if (profileId) {
        state = { ...state, profiles: state.profiles.map((entry) => entry.id === profileId ? { ...entry, javaPath: info.path } : entry) }
      }
      emit('toast', { id: String(Date.now()), type: 'success', message: t('Java {version} установлена: {path}', { version: major, path: info.path }) })
      return info
    },
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
    },

    listSkins: async () => [...skins],
    importSkin: async () => {
      const id = `skin-${Date.now()}`
      const skin: SkinInfo = {
        id,
        name: t('Новый скин'),
        model: 'wide',
        dataUrl: skinPreview('#14b8a6', '#7c3aed'),
        size: 4096 + Math.floor(Math.random() * 2000),
        addedAt: Date.now(),
        active: false
      }
      skins = [skin, ...skins]
      emit('toast', { id: String(Date.now()), type: 'success', message: t('Скин загружен') })
      return skin
    },
    deleteSkin: async (id) => {
      skins = skins.filter((skin) => skin.id !== id)
    },
    selectSkin: async (id) => {
      skins = skins.map((skin) => ({ ...skin, active: skin.id === id }))
      state = { ...state, settings: { ...state.settings, activeSkinId: id ?? undefined } }
    },
    setSkinModel: async (id, model) => {
      skins = skins.map((skin) => (skin.id === id ? { ...skin, model } : skin))
    },

    checkUpdates: async (): Promise<UpdateInfo> => ({
      currentVersion: '1.0.0',
      latestVersion: '1.0.0',
      url: 'https://github.com/NathanKaz/Minecraft-launcher/releases/latest',
      updateAvailable: false
    }),
    verifyProfile: async (id, repair): Promise<VerifyReport> => {
      await mockProgress(t(repair ? 'Восстановление файлов' : 'Проверка файлов'), 'version')
      return { profileId: id, checked: 128, missing: [], invalid: [], ok: true }
    },

    listBackups: async (profileId) => [...(backupsByProfile[profileId] ?? [])],
    createBackup: async (profileId) => {
      const backup: BackupInfo = {
        fileName: `worlds-${Date.now()}.zip`,
        name: t('Миры') + ` ${new Date().toLocaleString()}`,
        size: 12_400_000,
        createdAt: Date.now()
      }
      backupsByProfile[profileId] = [backup, ...(backupsByProfile[profileId] ?? [])]
      emit('toast', { id: String(Date.now()), type: 'success', message: t('Резервная копия создана') })
      return backup
    },
    restoreBackup: async () => {
      await wait(300)
      emit('toast', { id: String(Date.now()), type: 'success', message: t('Миры восстановлены') })
    },
    deleteBackup: async (profileId, fileName) => {
      backupsByProfile[profileId] = (backupsByProfile[profileId] ?? []).filter((backup) => backup.fileName !== fileName)
    },
    backupAllProfiles: async () => {
      for (const profile of state.profiles) await api.createBackup(profile.id)
      return state.profiles.length
    },
    exportProfiles: async (profileIds) => {
      if (profileIds.length === 0) return null
      await wait(300)
      return `demo://lumen-instances-${profileIds.length}.zip`
    },
    importProfiles: async () => {
      await wait(300)
      const source = state.profiles[0]
      if (!source) return 0
      const copy = { ...source, id: `imported-${Date.now()}`, name: `${source.name} (import)`, createdAt: Date.now(), playtimeMinutes: 0, lastPlayed: undefined }
      state = { ...state, profiles: [...state.profiles, copy], selectedProfileId: copy.id }
      return 1
    },

    listPacks: async (profileId, kind) => {
      const packs = packsByProfile[profileId] ?? []
      return packs.filter((pack) => pack.kind === kind).map((pack) => ({ ...pack }))
    },
    installPack: async (profileId, kind) => {
      const pack: PackInfo = {
        fileName: `new-${kind}-${Date.now()}.zip`,
        name: t(kind === 'resource' ? 'Новый набор ресурсов' : 'Новый набор шейдеров'),
        kind,
        enabled: false,
        size: 3_200_000
      }
      packsByProfile[profileId] = [...(packsByProfile[profileId] ?? []), pack]
      emit('toast', { id: String(Date.now()), type: 'success', message: t(kind === 'resource' ? 'Набор ресурсов установлен' : 'Набор шейдеров установлен') })
    },
    togglePack: async (profileId, kind, fileName, enabled) => {
      packsByProfile[profileId] = (packsByProfile[profileId] ?? []).map((pack) =>
        pack.fileName === fileName && pack.kind === kind ? { ...pack, enabled } : pack
      )
    },
    deletePack: async (profileId, kind, fileName) => {
      packsByProfile[profileId] = (packsByProfile[profileId] ?? []).filter(
        (pack) => !(pack.fileName === fileName && pack.kind === kind)
      )
    },

    checkModUpdates: async (profileId): Promise<ModUpdateInfo[]> => {
      await wait(300)
      return modsFor(profileId).slice(0, 1).map((mod) => ({
        fileName: mod.fileName,
        name: mod.name,
        currentVersion: mod.version,
        latestVersion: `${mod.version.split('.')[0]}.${Number.parseInt(mod.version.split('.')[1] ?? '0', 10) + 1}.0`,
        projectId: mod.fileName.split('-')[0]
      }))
    },
    updateMod: async (profileId, fileName, versionId) => {
      await mockProgress(t('Обновление мода'), 'mod')
      modsByProfile[profileId] = modsFor(profileId).map((mod) =>
        mod.fileName === fileName ? { ...mod, version: versionId, fileName: `${mod.name.replace(/\s+/g, '-').toLowerCase()}-${versionId}.jar` } : mod
      )
      emit('toast', { id: String(Date.now()), type: 'success', message: t('Мод обновлён') })
    }
  }
  return api
}

export const api: LauncherAPI = window.launcher ?? createMock()
export const isMock = api.isMock
