import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Download, ExternalLink, Globe2, KeyRound, Loader2, Search } from 'lucide-react'
import { t } from '../lib/i18n'
import { api, isMock } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, Button, EmptyState, Spinner } from './ui'
import type { WorldProject } from '@shared/types'

const PAGE_SIZE = 18

/** CurseForge world browser; Modrinth does not offer ready-made worlds. */
export function WorldCatalog({ profileId, gameVersion }: { profileId: string; gameVersion?: string }): JSX.Element {
  const { state, setPage, pushToast } = useLauncher()
  const keyConfigured = Boolean(state?.settings.curseforgeApiKey?.trim())
  const [query, setQuery] = useState('')
  const [worlds, setWorlds] = useState<WorldProject[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!keyConfigured && !isMock) return
    let cancelled = false
    setLoading(true)
    setError('')
    const timer = setTimeout(() => {
      void api.searchWorlds(query, 0).then((result) => {
        if (cancelled) return
        setWorlds(result)
        setOffset(result.length)
        setHasMore(result.length >= PAGE_SIZE)
      }).catch((cause: unknown) => {
        if (!cancelled) {
          setWorlds([])
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      }).finally(() => {
        if (!cancelled) setLoading(false)
      })
    }, 280)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, keyConfigured])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const result = await api.searchWorlds(query, offset)
      setWorlds((current) => [...current, ...result])
      setOffset((current) => current + result.length)
      setHasMore(result.length >= PAGE_SIZE)
    } finally {
      setLoadingMore(false)
    }
  }

  const install = async (world: WorldProject) => {
    setInstalling(world.project_id)
    try {
      await api.installWorld(profileId, world.project_id, gameVersion)
      pushToast('success', t('Мир «{name}» добавлен в сборку', { name: world.title }))
    } catch (cause) {
      pushToast('error', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setInstalling(null)
    }
  }

  if (!keyConfigured && !isMock) {
    return (
      <div className="panel flex flex-col items-center gap-3 p-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint-400/10 text-mint-400"><KeyRound size={22} /></div>
        <h3 className="text-sm font-bold text-white">{t('Ключ не задан')}</h3>
        <p className="max-w-md text-xs leading-relaxed text-slate-500">
          {t('Укажите ключ API CurseForge в настройках лаунчера.')}
        </p>
        <Button variant="primary" onClick={() => setPage('settings')}>
          <KeyRound size={15} /> {t('Настроить')}
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('Каталог миров CurseForge')}</h3>
        <span className="text-[10px] text-slate-600">{t('Готовые миры')}</span>
        <div className="relative ml-auto w-full max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input py-2 pl-9 text-xs"
            placeholder={t('Поиск миров')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-500/[0.06] p-3 text-[11px] text-rose-300">{error}</div>
      )}

      {loading && !worlds.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="panel shimmer h-52 animate-shimmer" />)}
        </div>
      ) : worlds.length ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {worlds.map((world, index) => (
              <motion.div
                key={world.project_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index, 12) * 0.03 }}
                className="panel flex flex-col overflow-hidden"
              >
                <div className="relative h-24 overflow-hidden bg-gradient-to-br from-mint-500/20 via-ink-800 to-iris-600/30">
                  {world.icon_url && <img src={world.icon_url} alt="" className="h-full w-full object-cover opacity-80" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-800 to-transparent" />
                  <div className="absolute bottom-3 left-4"><Badge tone="mint"><Globe2 size={11} /> {t('Мир')}</Badge></div>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="truncate text-sm font-bold text-white">{world.title}</div>
                  <p className="mt-2 line-clamp-2 min-h-[34px] text-[11px] leading-relaxed text-slate-400">{t(world.description)}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {world.categories.slice(0, 2).map((category) => <Badge key={category}>{category}</Badge>)}
                    {world.versions?.slice(0, 2).map((version) => <Badge key={version} tone="amber">{version}</Badge>)}
                  </div>
                  <div className="mt-3 text-[10px] text-slate-600">{t('{count} загрузок', { count: world.downloads > 1e6 ? `${(world.downloads / 1e6).toFixed(1)}M` : `${Math.round(world.downloads / 1e3)}K` })}</div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="primary"
                      className="flex-1 justify-center"
                      disabled={installing !== null}
                      onClick={() => void install(world)}
                    >
                      {installing === world.project_id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                      {t('Установить')}
                    </Button>
                    {world.websiteUrl && (
                      <Button
                        title={t('Открыть на CurseForge')}
                        onClick={() => void api.openExternal(world.websiteUrl!)}
                      >
                        <ExternalLink size={15} />
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="mt-5 flex flex-col items-center gap-2">
            {loadingMore && <Spinner size={18} />}
            {hasMore && !loadingMore && <Button onClick={() => void loadMore()}><ChevronDown size={15} /> {t('Показать ещё')}</Button>}
          </div>
        </>
      ) : (
        <EmptyState icon={<Globe2 size={22} />} title={t("Ничего не найдено")} description={t("Попробуйте другой запрос или отключите фильтры.")} />
      )}
    </div>
  )
}
