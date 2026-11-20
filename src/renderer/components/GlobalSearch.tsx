import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CornerDownLeft,
  FolderOpen,
  Gamepad2,
  HardDriveDownload,
  Image as ImageIcon,
  LayoutDashboard,
  Map,
  Package,
  Puzzle,
  Search,
  SearchX,
  Settings as SettingsIcon,
  Shirt,
  SlidersHorizontal,
  Terminal,
  Wrench,
  X
} from 'lucide-react'
import type { ModInfo, Profile, WorldInfo } from '@shared/types'
import { api } from '../lib/api'
import { t } from '../lib/i18n'
import { useLauncher, type Page } from '../store'
import { EmptyState, Spinner } from './ui'

type GroupKey = 'instances' | 'mods' | 'worlds' | 'settings' | 'navigation' | 'actions'

interface SearchItem {
  id: string
  group: GroupKey
  label: string
  hint?: string
  keywords?: string
  icon: LucideIcon
  run: () => void
}

interface ModHit {
  item: ModInfo
  profile: Profile
}

interface WorldHit {
  item: WorldInfo
  profile: Profile
}

const NO_PROFILES: Profile[] = []

// Labels are functions so a language switch updates the open palette immediately.
const GROUP_LABEL: Record<GroupKey, () => string> = {
  instances: () => t('Мои сборки'),
  mods: () => t('Моды'),
  worlds: () => t('Миры'),
  settings: () => t('Настройки'),
  navigation: () => t('Навигация'),
  actions: () => t('Быстрые действия')
}

export function GlobalSearch(): JSX.Element {
  const { state, globalSearchOpen, setGlobalSearchOpen, setPage, openProfile, pushToast } = useLauncher()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [hits, setHits] = useState<{ mods: ModHit[]; worlds: WorldHit[] }>({ mods: [], worlds: [] })
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const cacheRef = useRef<{ mods: Record<string, ModInfo[]>; worlds: Record<string, WorldInfo[]> }>({
    mods: {},
    worlds: {}
  })

  const profiles = state?.profiles ?? NO_PROFILES
  const normalized = query.trim().toLowerCase()

  // Reset and focus every time the palette opens.
  useEffect(() => {
    if (!globalSearchOpen) return
    setQuery('')
    setSelected(0)
    setHits({ mods: [], worlds: [] })
    inputRef.current?.focus()
  }, [globalSearchOpen])

  // Debounced, cached lookup of per-instance mods and worlds. Failures are ignored.
  useEffect(() => {
    if (!globalSearchOpen || !normalized || profiles.length === 0) {
      setHits({ mods: [], worlds: [] })
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(() => {
      const modsPromise = Promise.all(
        profiles.map(async (profile) => {
          try {
            let mods = cacheRef.current.mods[profile.id]
            if (!mods) {
              mods = await api.listMods(profile.id)
              cacheRef.current.mods[profile.id] = mods
            }
            return mods.map((item): ModHit => ({ item, profile }))
          } catch {
            return [] as ModHit[]
          }
        })
      ).then((groups) => groups.flat())

      const worldsPromise = Promise.all(
        profiles.map(async (profile) => {
          try {
            let worlds = cacheRef.current.worlds[profile.id]
            if (!worlds) {
              worlds = await api.listWorlds(profile.id)
              cacheRef.current.worlds[profile.id] = worlds
            }
            return worlds.map((item): WorldHit => ({ item, profile }))
          } catch {
            return [] as WorldHit[]
          }
        })
      ).then((groups) => groups.flat())

      void Promise.all([modsPromise, worldsPromise]).then(([mods, worlds]) => {
        if (cancelled) return
        setHits({ mods, worlds })
        setSearching(false)
      })
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [globalSearchOpen, normalized, profiles])

  const results = useMemo<SearchItem[]>(() => {
    const matches = (value: string, keywords = ''): boolean =>
      !normalized || `${value} ${keywords}`.toLowerCase().includes(normalized)
    const items: SearchItem[] = []

    for (const profile of profiles) {
      if (!matches(`${profile.name} ${profile.versionId} ${profile.loader}`)) continue
      items.push({
        id: `instance:${profile.id}`,
        group: 'instances',
        label: profile.name,
        hint: `${profile.versionId} · ${profile.loader}`,
        icon: Gamepad2,
        run: () => {
          setPage('home')
          void openProfile(profile.id)
        }
      })
    }

    const openInstance = (profileId: string) => {
      setPage('home')
      void openProfile(profileId)
    }

    for (const { item, profile } of hits.mods) {
      if (!matches(`${item.name} ${item.fileName}`)) continue
      items.push({
        id: `mod:${profile.id}:${item.fileName}`,
        group: 'mods',
        label: item.name,
        hint: `${profile.name} · ${item.version}`,
        keywords: 'mod',
        icon: Puzzle,
        run: () => openInstance(profile.id)
      })
    }

    for (const { item, profile } of hits.worlds) {
      if (!matches(`${item.name} ${item.dirName}`)) continue
      items.push({
        id: `world:${profile.id}:${item.dirName}`,
        group: 'worlds',
        label: item.name,
        hint: `${profile.name} · ${item.version}`,
        keywords: 'world save',
        icon: Map,
        run: () => openInstance(profile.id)
      })
    }

    const settingsSections: Array<{ id: string; label: string; keywords: string; icon: LucideIcon }> = [
      { id: 'java', label: t('Java'), keywords: 'java jdk jvm', icon: Wrench },
      { id: 'performance', label: t('Производительность'), keywords: 'performance memory ram fps', icon: SlidersHorizontal },
      { id: 'folders', label: t('Каталоги'), keywords: 'folders paths directories', icon: FolderOpen },
      { id: 'general', label: t('Общее'), keywords: 'general language updates', icon: SettingsIcon },
      { id: 'backups', label: t('Бэкапы по расписанию'), keywords: 'backup scheduled autosave', icon: CalendarClock },
      { id: 'logs', label: t('Журналы'), keywords: 'logs crash reports', icon: Terminal }
    ]
    for (const section of settingsSections) {
      if (!matches(section.label, section.keywords)) continue
      items.push({
        id: `settings:${section.id}`,
        group: 'settings',
        label: section.label,
        icon: section.icon,
        run: () => setPage('settings')
      })
    }

    const navigation: Array<{ id: Page; label: string; keywords: string; icon: LucideIcon }> = [
      { id: 'home', label: t('Главная'), keywords: 'home main instances', icon: LayoutDashboard },
      { id: 'screenshots', label: t('Скриншоты'), keywords: 'screenshots f2', icon: ImageIcon },
      { id: 'skins', label: t('Скины'), keywords: 'skins player', icon: Shirt },
      { id: 'modpacks', label: t('Модпаки'), keywords: 'modpacks modrinth', icon: Package },
      { id: 'settings', label: t('Настройки'), keywords: 'settings preferences', icon: SettingsIcon }
    ]
    for (const nav of navigation) {
      if (!matches(nav.label, nav.keywords)) continue
      items.push({
        id: `nav:${nav.id}`,
        group: 'navigation',
        label: nav.label,
        icon: nav.icon,
        run: () => setPage(nav.id)
      })
    }

    const actions: SearchItem[] = [
      {
        id: 'action:backup-all',
        group: 'actions',
        label: t('Создать бэкапы всех миров'),
        keywords: 'backup all instances worlds',
        icon: HardDriveDownload,
        run: () => {
          void api
            .backupAllProfiles()
            .then((count) => pushToast('success', t('Создано бэкапов: {count}', { count })))
            .catch(() => {})
        }
      },
      {
        id: 'action:logs-folder',
        group: 'actions',
        label: `${t('Открыть папку')} · ${t('Журналы')}`,
        keywords: 'logs folder open',
        icon: FolderOpen,
        run: () => {
          void api.openFolder('logs').catch(() => {})
        }
      }
    ]
    for (const action of actions) {
      if (!matches(action.label, action.keywords)) continue
      items.push(action)
    }

    return items
  }, [profiles, normalized, hits, setPage, openProfile, pushToast])

  // Keep the highlighted row valid when the query or loaded results change.
  useEffect(() => {
    setSelected(0)
  }, [normalized, hits])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!globalSearchOpen) return <></>

  const close = () => setGlobalSearchOpen(false)
  const choose = (item: SearchItem | undefined) => {
    if (!item) return
    close()
    item.run()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((current) => (results.length ? (current + 1) % results.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((current) => (results.length ? (current - 1 + results.length) % results.length : 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(results[selected])
    }
  }

  let currentGroup: GroupKey | null = null

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
      onKeyDown={onKeyDown}
    >
      <motion.div
        className="panel w-full max-w-2xl overflow-hidden"
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.16 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <Search size={18} className="shrink-0 text-mint-300" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Поиск по лаунчеру...')}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
          />
          {searching && <Spinner size={14} />}
          <button
            onClick={close}
            aria-label={t('Закрыть')}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div ref={listRef} className="max-h-[58vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <EmptyState
              icon={<SearchX size={22} />}
              title={t('Ничего не найдено')}
              description={t('Попробуйте другой запрос или отключите фильтры.')}
            />
          ) : (
            results.map((item, index) => {
              const showGroup = item.group !== currentGroup
              currentGroup = item.group
              const Icon = item.icon
              const active = index === selected
              return (
                <div key={item.id}>
                  {showGroup && (
                    <div className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
                      {GROUP_LABEL[item.group]()}
                    </div>
                  )}
                  <button
                    type="button"
                    data-index={index}
                    onMouseEnter={() => setSelected(index)}
                    onClick={() => choose(item)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                      active ? 'bg-mint-400/10 text-white' : 'text-slate-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        active ? 'bg-mint-400/15 text-mint-300' : 'bg-white/[0.05] text-slate-400'
                      }`}
                    >
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{item.label}</span>
                      {item.hint && <span className="block truncate text-[10px] text-slate-500">{item.hint}</span>}
                    </span>
                    {active && <CornerDownLeft size={13} className="shrink-0 text-slate-500" />}
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-2 text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-semibold text-slate-400">Ctrl</kbd>
            <span>+</span>
            <kbd className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-semibold text-slate-400">K</kbd>
            <span className="ml-1">{t('Найти')}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <ArrowUp size={11} />
            <ArrowDown size={11} />
            <span>{t('Открыть')}</span>
            <CornerDownLeft size={11} />
          </span>
        </div>
      </motion.div>
    </motion.div>
  )
}
