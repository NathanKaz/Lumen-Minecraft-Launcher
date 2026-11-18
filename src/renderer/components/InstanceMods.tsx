import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Download, FolderPlus, Loader2, Power, Search, SlidersHorizontal, Trash2, Wrench } from 'lucide-react'
import { api } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, Button, EmptyState, Spinner, Toggle } from './ui'
import { ProjectDetailPanel } from './ProjectDetailPanel'
import type { ModInfo, ModrinthProject } from '@shared/types'

const PAGE_SIZE = 24

function formatDownloads(value: number): string {
  if (value > 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value > 1e3) return `${(value / 1e3).toFixed(0)}K`
  return String(value)
}

export function InstanceMods({ profileId }: { profileId: string }): JSX.Element {
  const { state, busy, setBusy, pushToast } = useLauncher()
  const profile = state?.profiles.find((item) => item.id === profileId) ?? null
  const [tab, setTab] = useState<'catalog' | 'installed'>('catalog')
  const [query, setQuery] = useState('')
  const [matchVersion, setMatchVersion] = useState(false)
  const [matchLoader, setMatchLoader] = useState(false)
  const [projects, setProjects] = useState<ModrinthProject[]>([])
  const [mods, setMods] = useState<ModInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [installing, setInstalling] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  const versionFilter = matchVersion ? profile?.versionId : undefined
  const loaderFilter = matchLoader ? profile?.loader : undefined

  const loadMods = async () => {
    const result = await api.listMods(profileId)
    setMods(result)
  }

  useEffect(() => {
    void loadMods()
  }, [profileId, state?.installedVersions.length])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      void api.searchMods(query, versionFilter, loaderFilter, 0).then((result) => {
        if (cancelled) return
        setProjects(result)
        setOffset(result.length)
        setHasMore(result.length >= PAGE_SIZE)
      }).catch(() => {
        if (!cancelled) {
          setProjects([])
          setHasMore(false)
        }
      }).finally(() => {
        if (!cancelled) setLoading(false)
      })
    }, 280)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, versionFilter, loaderFilter])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const result = await api.searchMods(query, versionFilter, loaderFilter, offset)
      setProjects((current) => [...current, ...result])
      setOffset((current) => current + result.length)
      setHasMore(result.length >= PAGE_SIZE)
    } finally {
      setLoadingMore(false)
    }
  }

  const install = async (projectId: string) => {
    setInstalling(projectId)
    setBusy(true)
    try {
      await api.installMod(profileId, projectId)
      await loadMods()
      pushToast('success', 'Мод добавлен в сборку')
    } finally {
      setInstalling(null)
      setBusy(false)
    }
  }

  const installLocal = async () => {
    setBusy(true)
    try {
      await api.installLocalMod(profileId)
      await loadMods()
      pushToast('success', 'Моды добавлены в сборку')
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (fileName: string) => {
    await api.toggleMod(profileId, fileName)
    await loadMods()
  }

  const remove = async (fileName: string) => {
    await api.deleteMod(profileId, fileName)
    await loadMods()
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
          {(['catalog', 'installed'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`relative rounded-lg px-4 py-2 text-xs font-semibold transition ${tab === item ? 'text-mint-300' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {tab === item && <motion.span layoutId="instance-mods-tab" className="absolute inset-0 rounded-lg bg-mint-400/10" />}
              <span className="relative">{item === 'catalog' ? 'Каталог' : `Установленные (${mods.length})`}</span>
            </button>
          ))}
        </div>
        <Button onClick={() => void installLocal()} disabled={busy}><FolderPlus size={16} /> Из файла</Button>
        {tab === 'catalog' && (
          <>
            <div className="relative min-w-[220px] flex-1">
              <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input pl-10"
                placeholder="Поиск модов (Sodium, JEI, шейдеры...)"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={14} className="text-slate-600" />
              <button
                onClick={() => setMatchVersion((value) => !value)}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  matchVersion ? 'border-mint-400/40 bg-mint-400/10 text-mint-300' : 'border-white/[0.08] text-slate-500 hover:text-slate-200'
                }`}
                title={`Показывать только моды для Minecraft ${profile?.versionId ?? '—'}`}
              >
                Версия {profile?.versionId ?? ''}
              </button>
              <button
                onClick={() => setMatchLoader((value) => !value)}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  matchLoader ? 'border-mint-400/40 bg-mint-400/10 text-mint-300' : 'border-white/[0.08] text-slate-500 hover:text-slate-200'
                }`}
                title={`Показывать только моды для ${profile?.loader ?? '—'}`}
              >
                {(profile?.loader ?? 'vanilla').toUpperCase()}
              </button>
            </div>
          </>
        )}
      </div>

      {tab === 'catalog' ? (
        loading && !projects.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="panel shimmer h-44 animate-shimmer" />
            ))}
          </div>
        ) : projects.length ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((project, index) => (
                <motion.div
                  key={project.project_id}
                  role="button"
                  tabIndex={0}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index, 12) * 0.02 }}
                  onClick={() => setSelectedProjectId(project.project_id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedProjectId(project.project_id)
                    }
                  }}
                  className="panel group flex cursor-pointer flex-col p-4 transition hover:border-mint-400/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint-400/40"
                >
                  <div className="flex items-start gap-3">
                    {project.icon_url ? (
                      <img src={project.icon_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/5 text-slate-500"><Wrench size={20} /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-white">{project.title}</div>
                      <div className="text-[10px] text-slate-500">{formatDownloads(project.downloads)} загрузок</div>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 min-h-[36px] text-[11px] leading-relaxed text-slate-400">{project.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {project.categories.slice(0, 3).map((category) => <Badge key={category}>{category}</Badge>)}
                    {project.versions?.slice(0, 2).map((version) => <Badge key={version} tone="amber">{version}</Badge>)}
                  </div>
                  <Button
                    variant="primary"
                    className="mt-4 w-full"
                    disabled={busy}
                    onClick={(event) => {
                      event.stopPropagation()
                      void install(project.project_id)
                    }}
                  >
                    {installing === project.project_id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    {installing === project.project_id ? 'Установка...' : 'Установить'}
                  </Button>
                </motion.div>
              ))}
            </div>
            <div className="mt-5 flex flex-col items-center gap-2">
              {loadingMore && <Spinner size={18} />}
              {hasMore && !loadingMore && (
                <Button onClick={() => void loadMore()}><ChevronDown size={15} /> Показать ещё</Button>
              )}
              <span className="text-[10px] text-slate-600">
                Показано {projects.length} · фильтры версии и загрузчика выключены по умолчанию
              </span>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<Search size={22} />}
            title="Ничего не найдено"
            description="Попробуйте другой запрос или отключите фильтры версии и загрузчика."
          />
        )
      ) : mods.length ? (
        <div className="panel divide-y divide-white/[0.05] overflow-hidden">
          {mods.map((mod) => (
            <div key={mod.fileName} className="flex items-center gap-4 px-5 py-4 transition hover:bg-white/[0.02]">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${mod.enabled ? 'bg-mint-400/10 text-mint-400' : 'bg-white/5 text-slate-600'}`}>
                <Wrench size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`truncate text-sm font-semibold ${mod.enabled ? 'text-slate-100' : 'text-slate-500 line-through'}`}>{mod.name}</span>
                  {mod.version && <Badge>v{mod.version}</Badge>}
                  <Badge tone="iris">{mod.loader}</Badge>
                </div>
                <div className="mt-1 truncate text-[11px] text-slate-500">{mod.description ?? mod.fileName}</div>
              </div>
              <span className="hidden text-[10px] text-slate-600 sm:block">{(mod.size / 1e6).toFixed(1)} МБ</span>
              <Toggle checked={mod.enabled} onChange={() => void toggle(mod.fileName)} />
              <button onClick={() => void remove(mod.fileName)} className="rounded-lg p-2 text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-400" title="Удалить">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Power size={22} />}
          title="Моды пока не установлены"
          description="Найдите моды в каталоге или добавьте .jar файл вручную."
          action={<Button variant="primary" onClick={() => setTab('catalog')}>Открыть каталог</Button>}
        />
      )}

      <ProjectDetailPanel
        projectId={selectedProjectId}
        kind="mod"
        onClose={() => setSelectedProjectId(null)}
        action={selectedProjectId ? {
          label: 'Установить в сборку',
          onClick: () => void install(selectedProjectId),
          disabled: busy,
          loading: installing === selectedProjectId
        } : undefined}
      />

      {busy && installing && <div className="fixed bottom-6 left-1/2 -translate-x-1/2"><Spinner /></div>}
    </div>
  )
}
