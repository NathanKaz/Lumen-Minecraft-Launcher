import { useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import { motion } from 'framer-motion'
import { ChevronDown, Download, FileArchive, Layers3, Link2, Loader2, Package, Search, Upload } from 'lucide-react'
import { api } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, Button, EmptyState, Modal, SectionHeader, Select, Spinner } from '../components/ui'
import { ProjectDetailPanel } from '../components/ProjectDetailPanel'
import type { ModpackSort, ModrinthProject } from '@shared/types'

const PAGE_SIZE = 24

export function Modpacks({ embedded = false }: { embedded?: boolean }): JSX.Element {
  const { state, busy, setBusy, refresh, pushToast } = useLauncher()
  const [packs, setPacks] = useState<ModrinthProject[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ModpackSort>('relevance')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [urlOpen, setUrlOpen] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [urlInstalling, setUrlInstalling] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      void api.searchModpacks(query, 0, sort).then((result) => {
        if (!cancelled) {
          setPacks(result)
          setOffset(result.length)
          setHasMore(result.length >= PAGE_SIZE)
        }
      }).catch(() => {
        if (!cancelled) {
          setPacks([])
          setHasMore(false)
        }
      }).finally(() => {
        if (!cancelled) setLoading(false)
      })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, sort])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const result = await api.searchModpacks(query, offset, sort)
      setPacks((current) => [...current, ...result])
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
      await api.installModpackFromModrinth(projectId)
      await refresh()
    } finally {
      setInstalling(null)
      setBusy(false)
    }
  }

  const installLocal = async () => {
    setBusy(true)
    try {
      await api.installModpack()
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const installFromUrl = async () => {
    const url = urlDraft.trim()
    if (!url) return
    setUrlInstalling(true)
    setBusy(true)
    try {
      await api.installModpackFromUrl(url)
      await refresh()
      setUrlOpen(false)
      setUrlDraft('')
      pushToast('success', t('Модпак установлен по ссылке'))
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : String(error))
    } finally {
      setUrlInstalling(false)
      setBusy(false)
    }
  }

  const installedPacks = state?.profiles.filter((item) => item.modpack) ?? []

  return (
    <div className="mx-auto max-w-[1180px]">
      {!embedded && (
        <SectionHeader
          title={t("Модпаки")}
          subtitle={t("Готовые модпаки из Modrinth или установка из файла .mrpack.")}
          action={(
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setUrlOpen(true)} disabled={busy}><Link2 size={16} /> {t('Установить по ссылке')}</Button>
              <Button onClick={() => void installLocal()} disabled={busy}><FileArchive size={16} /> {t("Установить .mrpack")}</Button>
            </div>
          )}
        />
      )}

      <div
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const file = event.dataTransfer.files[0]
          if (!file) return
          setBusy(true)
          void api.installModpackFilePath(file.path).then(async () => {
            await refresh()
          }).finally(() => setBusy(false))
        }}
        className={`panel mb-6 flex items-center gap-5 border-2 border-dashed p-6 transition ${dragging ? 'border-mint-400/60 bg-mint-400/[0.06]' : 'border-white/[0.08]'}`}
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-iris-500/10 text-iris-400">
          <Upload size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white">{t("Перетащите файл модпака сюда")}</div>
          <p className="mt-1 text-xs text-slate-500">{t('Поддерживаются файлы .mrpack и .zip из Modrinth. Будет создана новая сборка.')}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Button onClick={() => void installLocal()} disabled={busy}>{t("Выбрать файл")}</Button>
          <Button onClick={() => setUrlOpen(true)} disabled={busy}><Link2 size={14} /> {t('По ссылке')}</Button>
        </div>
      </div>

      {!embedded && installedPacks.length > 0 && (
        <div className="mb-7">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t("Установленные модпаки")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {installedPacks.map((item) => (
              <div key={item.id} className="panel flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint-400/10 text-mint-400"><Layers3 size={18} /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{item.modpack?.name}</div>
                  <div className="text-[11px] text-slate-500">v{item.modpack?.version} · MC {item.versionId} · {item.loader}</div>
                </div>
                <Badge tone="mint">{t("Установлен")}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("Популярные модпаки")}</h3>
        <div className="relative ml-auto w-full max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input py-2 pl-9 text-xs" placeholder={t("Поиск модпаков")} value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600">{t('Сортировка')}</span>
          <Select
            className="w-40"
            value={sort}
            onChange={(value) => setSort(value as ModpackSort)}
            options={[
              { value: 'relevance', label: t('По соответствию') },
              { value: 'downloads', label: t('По популярности') },
              { value: 'updated', label: t('Недавно обновлённые') },
              { value: 'newest', label: t('Новые') }
            ]}
          />
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {loading && !packs.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="panel shimmer h-52 animate-shimmer" />)}
        </div>
          ) : packs.length ? (
            <div className={`grid gap-4 sm:grid-cols-2 ${selectedProjectId ? 'xl:grid-cols-2' : 'lg:grid-cols-3'}`}>
          {packs.map((pack, index) => (
            <motion.div
              key={pack.project_id}
              role="button"
              tabIndex={0}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => setSelectedProjectId(pack.project_id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedProjectId(pack.project_id)
                }
              }}
              className="panel group cursor-pointer overflow-hidden transition hover:border-iris-400/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint-400/40"
            >
              <div className="relative h-24 overflow-hidden bg-gradient-to-br from-iris-600/30 via-ink-800 to-mint-500/20">
                {pack.icon_url && <img src={pack.icon_url} alt="" className="h-full w-full object-cover opacity-80 transition group-hover:scale-105" />}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-800 to-transparent" />
                <div className="absolute bottom-3 left-4"><Badge tone="iris"><Package size={11} /> {t("Модпак")}</Badge></div>
              </div>
              <div className="p-4">
                <div className="truncate text-sm font-bold text-white">{pack.title}</div>
                <p className="mt-2 line-clamp-2 min-h-[34px] text-[11px] leading-relaxed text-slate-400">{t(pack.description)}</p>
                <div className="mt-3 flex items-center justify-between text-[10px] text-slate-600">
                  <span>{t('{count}M загрузок', { count: (pack.downloads / 1e6).toFixed(1) })}</span>
                  <span>{pack.categories.slice(0, 2).join(' · ')}</span>
                </div>
                <Button
                  variant="primary"
                  className="mt-4 w-full"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation()
                    void install(pack.project_id)
                  }}
                >
                  {installing === pack.project_id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  {installing === pack.project_id ? t("Установка...") : t("Установить модпак")}
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
          ) : (
            <EmptyState icon={<Package size={22} />} title={t("Модпаки не найдены")} description={t("Попробуйте изменить запрос.")} />
          )}

          {packs.length > 0 && (
            <div className="mt-5 flex flex-col items-center gap-2">
              {loadingMore && <Spinner size={18} />}
              {hasMore && !loadingMore && (
                <Button onClick={() => void loadMore()}><ChevronDown size={15} /> {t("Показать ещё")}</Button>
              )}
            </div>
          )}
        </div>

        <ProjectDetailPanel
          projectId={selectedProjectId}
          kind="modpack"
          onClose={() => setSelectedProjectId(null)}
          action={selectedProjectId ? {
            label: t('Создать сборку из модпака'),
            onClick: () => {
              const pack = packs.find((item) => item.project_id === selectedProjectId)
              if (pack) void install(pack.project_id)
            },
            disabled: busy,
            loading: installing === selectedProjectId
          } : undefined}
        />
      </div>

      <Modal open={urlOpen} onClose={() => setUrlOpen(false)} title={t('Установить модпак по ссылке')}>
        <div className="space-y-3">
          <label className="label" htmlFor="modpack-url">{t('Ссылка на модпак')}</label>
          <input
            id="modpack-url"
            className="input font-mono text-xs"
            placeholder="https://modrinth.com/modpack/slug"
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void installFromUrl() }}
          />
          <p className="text-[11px] leading-relaxed text-slate-500">
            {t('Вставьте ссылку на страницу модпака Modrinth (/modpack/...) или прямую ссылку на файл .mrpack')}
          </p>
          <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4">
            <Button onClick={() => setUrlOpen(false)}>{t('Отмена')}</Button>
            <Button variant="primary" onClick={() => void installFromUrl()} disabled={urlInstalling || !urlDraft.trim()}>
              {urlInstalling ? <Spinner size={14} /> : <Download size={14} />} {t('Установить')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
