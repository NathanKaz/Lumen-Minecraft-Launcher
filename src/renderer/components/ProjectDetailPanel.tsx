import { useEffect, useMemo, useState } from 'react'
import { t } from '../lib/i18n'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Download, ExternalLink, Globe, Heart, Image as ImageIcon, Loader2, Package, Tag, Trash2, X
} from 'lucide-react'
import { api } from '../lib/api'
import { Badge, Button, EmptyState, Select, Spinner } from './ui'
import { Markdown } from './Markdown'
import type { ModrinthProjectDetails, ModVersionInfo } from '@shared/types'

function formatDownloads(value: number): string {
  if (value > 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value > 1e3) return `${(value / 1e3).toFixed(1)}K`
  return String(value)
}

function followersOf(project: ModrinthProjectDetails): number {
  return project.follow_count ?? project.followers ?? 0
}

export function ProjectDetailPanel({
  projectId,
  kind,
  onClose,
  action
}: {
  projectId: string | null
  kind: 'mod' | 'modpack' | 'world' | 'datapack' | 'resourcepack' | 'shader'
  onClose: () => void
  action?: {
    label: string
    onClick: (versionId?: string) => void
    disabled?: boolean
    loading?: boolean
    installed?: boolean
    onDelete?: () => void
  }
}): JSX.Element {
  const [details, setDetails] = useState<ModrinthProjectDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeImage, setActiveImage] = useState(0)
  const [versions, setVersions] = useState<ModVersionInfo[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState('')

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setDetails(null)
    setActiveImage(0)
    void api.getProjectDetails(projectId).then((result) => {
      if (!cancelled) setDetails(result)
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : t("Не удалось загрузить информацию"))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [projectId])

  // Exact versions are offered for mods and shader packs (both are installable files).
  useEffect(() => {
    setVersions([])
    setSelectedVersion('')
    if (!projectId || (kind !== 'mod' && kind !== 'shader')) return
    let cancelled = false
    setVersionsLoading(true)
    void api.getProjectVersions(projectId).then((result) => {
      if (!cancelled) setVersions(result)
    }).catch(() => {
      if (!cancelled) setVersions([])
    }).finally(() => {
      if (!cancelled) setVersionsLoading(false)
    })
    return () => { cancelled = true }
  }, [projectId, kind])

  useEffect(() => {
    if (!projectId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [projectId, onClose])

  const gallery = useMemo(() => details?.gallery?.filter((image) => image.url) ?? [], [details])
  const gameVersions = details?.game_versions ?? details?.versions ?? []
  const loaders = (details?.loaders ?? []).filter((value) => value && value !== 'minecraft')
  const body = (details?.body ?? '').trim()

  const links = details ? [
    details.source_url ? { label: t("Исходники"), url: details.source_url } : null,
    details.issues_url ? { label: t("Проблемы"), url: details.issues_url } : null,
    details.wiki_url ? { label: t("Вики"), url: details.wiki_url } : null,
    details.discord_url ? { label: 'Discord', url: details.discord_url } : null
  ].filter(Boolean) as Array<{ label: string; url: string }> : []

  return (
    <AnimatePresence>
      {projectId && (
        <motion.aside
          className="panel flex max-h-[calc(100vh-2rem)] w-full shrink-0 flex-col self-start overflow-hidden lg:sticky lg:top-4 lg:w-[360px] xl:w-[400px]"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
          transition={{ duration: 0.18 }}
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Package size={16} className="text-mint-400" />
              {kind === 'mod' ? t("О моде")
                : kind === 'world' ? t("О мире")
                  : kind === 'datapack' ? t('О наборе данных')
                    : kind === 'resourcepack' ? t('О наборе ресурсов')
                      : kind === 'shader' ? t('О шейдере') : t("О модпаке")}
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white" title={t('Закрыть')}>
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
            {loading && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                <Spinner size={24} />
                <span className="text-sm">{t("Загрузка информации...")}</span>
              </div>
            )}

            {!loading && error && (
              <EmptyState icon={<Package size={22} />} title={t("Не удалось загрузить")} description={error} />
            )}

            {!loading && !error && details && (
              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  {details.icon_url ? (
                    <img src={details.icon_url} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-slate-500"><Package size={28} /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xl font-extrabold leading-tight text-white">{details.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">{t(details.description)}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1.5"><Download size={13} className="text-mint-400" /> {t('{count} загрузок', { count: formatDownloads(details.downloads) })}</span>
                      <span className="inline-flex items-center gap-1.5"><Heart size={13} className="text-rose-400" /> {t('{count} подписчиков', { count: formatDownloads(followersOf(details)) })}</span>
                    </div>
                  </div>
                </div>

                {action && (
                  <div className="space-y-3">
                    {(kind === 'mod' || kind === 'shader') && versions.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
                          {t(kind === 'shader' ? 'Версия шейдера' : 'Версия мода')}
                          {versionsLoading && <Spinner size={12} />}
                        </div>
                        <Select
                          value={selectedVersion}
                          onChange={setSelectedVersion}
                          options={[
                            { value: '', label: t('Авто · совместимая версия') },
                            ...versions.map((version) => ({
                              value: version.id,
                              label: `${version.version_number} · ${version.game_versions.join(', ') || '—'} · ${version.loaders.join('/') || '—'}`
                            }))
                          ]}
                          disabled={action.loading || action.installed}
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        className="flex-1"
                        disabled={action.disabled || action.loading || action.installed}
                        onClick={() => action.onClick(selectedVersion || undefined)}
                      >
                        {action.loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        {action.loading ? t("Установка...") : action.installed ? t('Установлен') : action.label}
                      </Button>
                      {action.installed && action.onDelete && (
                        <Button
                          variant="danger"
                          className="flex-1"
                          disabled={action.disabled || action.loading}
                          onClick={action.onDelete}
                        >
                          <Trash2 size={16} /> {t('Удалить')}
                        </Button>
                      )}
                    </div>
                    {action.installed && <p className="text-[11px] text-mint-300/80">{t('Мод уже установлен в эту сборку')}</p>}
                  </div>
                )}

                {gallery.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <ImageIcon size={14} /> {t("Скриншоты")}
                    </div>
                    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-ink-950">
                      <img
                        src={gallery[Math.min(activeImage, gallery.length - 1)].url}
                        alt={gallery[Math.min(activeImage, gallery.length - 1)].title ?? ''}
                        className="aspect-video w-full object-cover"
                      />
                    </div>
                    {gallery.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {gallery.map((image, index) => (
                          <button
                            key={`${image.url}-${index}`}
                            onClick={() => setActiveImage(index)}
                            className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border transition ${
                              index === Math.min(activeImage, gallery.length - 1)
                                ? 'border-mint-400/60 ring-1 ring-mint-400/30'
                                : 'border-white/[0.08] opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img src={image.url} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                    {gallery[Math.min(activeImage, gallery.length - 1)].title && (
                      <p className="text-[11px] text-slate-500">{gallery[Math.min(activeImage, gallery.length - 1)].title}</p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-6 text-center text-xs text-slate-600">
                    {t("Скриншотов у проекта нет")}
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                    <Tag size={14} /> {t("Категории и совместимость")}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {details.categories.map((category) => <Badge key={category}>{category}</Badge>)}
                    {!details.categories.length && <span className="text-xs text-slate-600">{t("Нет категорий")}</span>}
                  </div>
                  {(loaders.length > 0 || gameVersions.length > 0) && (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-slate-400">
                      {loaders.length > 0 && (
                        <div className="mb-2">
                          <span className="text-slate-500">{t("Загрузчики:")} </span>
                          <span className="font-medium text-slate-200">{loaders.map((item) => item.toUpperCase()).join(', ')}</span>
                        </div>
                      )}
                      {gameVersions.length > 0 && (
                        <div>
                          <span className="text-slate-500">{t("Версии игры:")} </span>
                          <span className="font-medium text-slate-200">
                            {gameVersions.slice(0, 12).join(', ')}{gameVersions.length > 12 ? t(' и ещё {count}', { count: gameVersions.length - 12 }) : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {body && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <Globe size={14} /> {t("Описание")}
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <Markdown source={body} />
                    </div>
                  </div>
                )}

                {links.length > 0 && (
                  <div className="space-y-2 pb-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("Ссылки")}</div>
                    <div className="flex flex-wrap gap-2">
                      {links.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-mint-400/30 hover:text-mint-300"
                        >
                          <ExternalLink size={13} /> {link.label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
