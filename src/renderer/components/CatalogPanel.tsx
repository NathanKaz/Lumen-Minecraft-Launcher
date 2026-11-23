import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Download, Layers, Loader2, Package, Search, SlidersHorizontal, Sparkles } from 'lucide-react'
import { t } from '../lib/i18n'
import { api } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, Button, EmptyState, Select, Spinner } from './ui'
import { ProjectDetailPanel } from './ProjectDetailPanel'
import type { CatalogKind, ModrinthProject } from '@shared/types'

const PAGE_SIZE = 18

/** Real Modrinth shader facets (including Iris/OptiFine, which are not in the public tag list). */
const SHADER_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: '', label: 'Все' },
  { id: 'realistic', label: 'Реализм' },
  { id: 'semi-realistic', label: 'Полуреализм' },
  { id: 'potato', label: 'Производительность' },
  { id: 'iris', label: 'Iris' },
  { id: 'optifine', label: 'OptiFine' },
  { id: 'vanilla-like', label: 'Ваниль' },
  { id: 'shadows', label: 'Тени' }
]

const ICONS: Record<CatalogKind, typeof Package> = {
  modpack: Package,
  datapack: Layers,
  resourcepack: Sparkles,
  shader: Sparkles
}

/** Shared Modrinth catalog used by worlds, resource packs and shaders. */
export function CatalogPanel({
  kind,
  profileId,
  category,
  title,
  onInstalled
}: {
  kind: CatalogKind
  profileId: string
  /** Fixed Modrinth category facet, e.g. worldgen or adventure. */
  category?: string
  title?: string
  onInstalled?: () => void
}): JSX.Element {
  const { state, versions, pushToast } = useLauncher()
  const profile = state?.profiles.find((item) => item.id === profileId)
  const [query, setQuery] = useState('')
  const [matchVersion, setMatchVersion] = useState(false)
  const [matchLoader, setMatchLoader] = useState(false)
  const [projects, setProjects] = useState<ModrinthProject[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState(category ?? '')
  const [gameVersion, setGameVersion] = useState(profile?.versionId ?? '')

  const selectedCategory = activeCategory || category || undefined
  const effectiveVersion = kind === 'shader'
    ? gameVersion || undefined
    : matchVersion ? profile?.versionId : undefined

  useEffect(() => { setActiveCategory(category ?? '') }, [category])
  useEffect(() => { setGameVersion(profile?.versionId ?? '') }, [profile?.versionId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      void api.searchCatalog({
        kind,
        query,
        category: selectedCategory,
        gameVersion: effectiveVersion,
        loader: matchLoader ? profile?.loader : undefined,
        offset: 0
      }).then((result) => {
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
  }, [kind, query, selectedCategory, effectiveVersion, matchLoader, profile?.loader])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const result = await api.searchCatalog({
        kind,
        query,
        category: selectedCategory,
        gameVersion: effectiveVersion,
        loader: matchLoader ? profile?.loader : undefined,
        offset
      })
      setProjects((current) => [...current, ...result])
      setOffset((current) => current + result.length)
      setHasMore(result.length >= PAGE_SIZE)
    } finally {
      setLoadingMore(false)
    }
  }

  const install = async (projectId: string, projectTitle: string, versionId?: string) => {
    setInstalling(projectId)
    try {
      await api.installCatalogProject(profileId, kind, projectId, versionId)
      pushToast('success', t('«{name}» установлено в сборку «{profile}»', {
        name: projectTitle,
        profile: profile?.name ?? '—'
      }))
      setSelectedId(null)
      onInstalled?.()
    } finally {
      setInstalling(null)
    }
  }

  const Icon = ICONS[kind]
  const detailKind = kind === 'modpack' ? 'modpack' : kind
  const shaderVersions = [...new Set([
    ...(profile?.versionId ? [profile.versionId] : []),
    ...(versions?.versions ?? []).filter((entry) => entry.type === 'release').slice(0, 30).map((entry) => entry.id)
  ])]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {title ?? t(kind === 'modpack' ? 'Карты и приключения'
            : kind === 'datapack' ? 'Наборы данных'
              : kind === 'resourcepack' ? 'Наборы ресурсов' : 'Шейдеры')}
        </h3>
        <span className="text-[10px] text-slate-600">
          {t('Установка в сборку «{name}»', { name: profile?.name ?? '—' })}
        </span>
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input py-2 pl-9 text-xs"
            placeholder={t('Поиск в каталоге')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {kind === 'shader' ? (
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-slate-600" />
            <Select
              className="w-44"
              value={gameVersion}
              onChange={setGameVersion}
              options={[
                { value: '', label: t('Все версии') },
                ...shaderVersions.map((version) => ({ value: version, label: `Minecraft ${version}` }))
              ]}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-slate-600" />
            <button
              onClick={() => setMatchVersion((value) => !value)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                matchVersion ? 'border-mint-400/40 bg-mint-400/10 text-mint-300' : 'border-white/[0.08] text-slate-500 hover:text-slate-200'
              }`}
              title={t('Показывать только проекты для Minecraft {version}', { version: profile?.versionId ?? '—' })}
            >
              {t('Версия {version}', { version: profile?.versionId ?? '' })}
            </button>
            {kind !== 'datapack' && (
              <button
                onClick={() => setMatchLoader((value) => !value)}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  matchLoader ? 'border-mint-400/40 bg-mint-400/10 text-mint-300' : 'border-white/[0.08] text-slate-500 hover:text-slate-200'
                }`}
              >
                {(profile?.loader ?? 'vanilla').toUpperCase()}
              </button>
            )}
          </div>
        )}
      </div>

      {kind === 'shader' && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {SHADER_CATEGORIES.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveCategory(item.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                activeCategory === item.id
                  ? 'border-mint-400/40 bg-mint-400/10 text-mint-300'
                  : 'border-white/[0.08] text-slate-500 hover:text-slate-200'
              }`}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {loading && !projects.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="panel shimmer h-48 animate-shimmer" />
          ))}
        </div>
          ) : projects.length ? (
            <>
              <div className={`grid gap-4 sm:grid-cols-2 ${selectedId ? 'xl:grid-cols-2' : 'xl:grid-cols-3'}`}>
            {projects.map((project, index) => (
              <motion.div
                key={project.project_id}
                role="button"
                tabIndex={0}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index, 12) * 0.03 }}
                onClick={() => setSelectedId(project.project_id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedId(project.project_id)
                  }
                }}
                className="panel group flex cursor-pointer flex-col p-4 transition hover:border-mint-400/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint-400/40"
              >
                <div className="flex items-start gap-3">
                  {project.icon_url ? (
                    <img src={project.icon_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/5 text-slate-500"><Icon size={20} /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-white">{project.title}</div>
                    <div className="text-[10px] text-slate-500">{t('{count} загрузок', { count: project.downloads > 1e6 ? `${(project.downloads / 1e6).toFixed(1)}M` : `${Math.round(project.downloads / 1e3)}K` })}</div>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 min-h-[34px] text-[11px] leading-relaxed text-slate-400">{t(project.description)}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {project.categories.slice(0, 3).map((item) => <Badge key={item}>{item}</Badge>)}
                  {project.versions?.slice(0, 2).map((item) => <Badge key={item} tone="amber">{item}</Badge>)}
                </div>
                <Button
                  variant="primary"
                  className="mt-4 w-full"
                  disabled={installing !== null}
                  onClick={(event) => {
                    event.stopPropagation()
                    void install(project.project_id, project.title)
                  }}
                >
                  {installing === project.project_id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  {installing === project.project_id ? t("Установка...") : t("Установить")}
                </Button>
              </motion.div>
            ))}
            </div>
            <div className="mt-5 flex flex-col items-center gap-2">
              {loadingMore && <Spinner size={18} />}
              {hasMore && !loadingMore && (
                <Button onClick={() => void loadMore()}><ChevronDown size={15} /> {t("Показать ещё")}</Button>
              )}
            </div>
            </>
          ) : (
            <EmptyState icon={<Search size={22} />} title={t("Ничего не найдено")} description={t("Попробуйте другой запрос или отключите фильтры.")} />
          )}
        </div>

        <ProjectDetailPanel
          projectId={selectedId}
          kind={detailKind}
          onClose={() => setSelectedId(null)}
          action={selectedId ? {
            label: t('Установить в «{name}»', { name: profile?.name ?? '—' }),
            onClick: (versionId) => {
              const project = projects.find((item) => item.project_id === selectedId)
              if (project) void install(project.project_id, project.title, versionId)
            },
            disabled: installing !== null,
            loading: installing === selectedId
          } : undefined}
        />
      </div>
    </div>
  )
}
