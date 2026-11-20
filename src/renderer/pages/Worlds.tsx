import { useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import { motion } from 'framer-motion'
import { Download, Globe2, Loader2, Search } from 'lucide-react'
import { api } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, Button, EmptyState } from '../components/ui'
import { ProjectDetailPanel } from '../components/ProjectDetailPanel'
import type { ModrinthProject } from '@shared/types'

/** Modrinth world catalog, embedded as a tab of a single instance. */
export function Worlds({ profileId }: { profileId: string }): JSX.Element {
  const { state, busy, setBusy, refresh, pushToast } = useLauncher()
  const target = state?.profiles.find((item) => item.id === profileId)
  const [worlds, setWorlds] = useState<ModrinthProject[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      void api.searchWorlds(query).then((result) => {
        if (!cancelled) setWorlds(result)
      }).catch(() => {
        if (!cancelled) setWorlds([])
      }).finally(() => {
        if (!cancelled) setLoading(false)
      })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const install = async (projectId: string, title: string) => {
    setInstalling(projectId)
    setBusy(true)
    try {
      await api.installWorld(profileId, projectId)
      await refresh()
      pushToast('success', t('Мир «{name}» установлен', { name: title }))
    } finally {
      setInstalling(null)
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("Популярные миры")}</h3>
        <span className="text-[10px] text-slate-600">{t('Установка в папку saves сборки «{name}»', { name: target?.name ?? '—' })}</span>
        <div className="relative ml-auto w-full max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input py-2 pl-9 text-xs" placeholder={t("Поиск миров")} value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>

      {loading && !worlds.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="panel shimmer h-52 animate-shimmer" />)}
        </div>
      ) : worlds.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {worlds.map((world, index) => (
            <motion.div
              key={world.project_id}
              role="button"
              tabIndex={0}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => setSelectedProjectId(world.project_id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedProjectId(world.project_id)
                }
              }}
              className="panel group cursor-pointer overflow-hidden transition hover:border-mint-400/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint-400/40"
            >
              <div className="relative h-24 overflow-hidden bg-gradient-to-br from-mint-500/20 via-ink-800 to-iris-600/30">
                {world.icon_url && <img src={world.icon_url} alt="" className="h-full w-full object-cover opacity-80 transition group-hover:scale-105" />}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-800 to-transparent" />
                <div className="absolute bottom-3 left-4"><Badge tone="mint"><Globe2 size={11} /> {t("Мир")}</Badge></div>
              </div>
              <div className="p-4">
                <div className="truncate text-sm font-bold text-white">{world.title}</div>
                <p className="mt-2 line-clamp-2 min-h-[34px] text-[11px] leading-relaxed text-slate-400">{t(world.description)}</p>
                <div className="mt-3 flex items-center justify-between text-[10px] text-slate-600">
                  <span>{t('{count}M загрузок', { count: (world.downloads / 1e6).toFixed(1) })}</span>
                  <span>{world.categories.slice(0, 2).join(' · ')}</span>
                </div>
                <Button
                  variant="primary"
                  className="mt-4 w-full"
                  disabled={busy || !target}
                  onClick={(event) => {
                    event.stopPropagation()
                    void install(world.project_id, world.title)
                  }}
                >
                  {installing === world.project_id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  {installing === world.project_id ? t("Установка...") : t("Установить мир")}
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Globe2 size={22} />} title={t("Миры не найдены")} description={t("Попробуйте изменить запрос.")} />
      )}

      <ProjectDetailPanel
        projectId={selectedProjectId}
        kind="world"
        onClose={() => setSelectedProjectId(null)}
        action={selectedProjectId ? {
          label: target ? t('Установить в «{name}»', { name: target.name }) : t("Установить мир"),
          onClick: () => {
            const world = worlds.find((item) => item.project_id === selectedProjectId)
            if (world) void install(world.project_id, world.title)
          },
          disabled: busy || !target,
          loading: installing === selectedProjectId
        } : undefined}
      />
    </div>
  )
}
