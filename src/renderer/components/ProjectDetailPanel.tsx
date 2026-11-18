import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Download, ExternalLink, Globe, Heart, Image as ImageIcon, Loader2, Package, Tag, X
} from 'lucide-react'
import { api } from '../lib/api'
import { Badge, Button, EmptyState, Spinner } from './ui'
import type { ModrinthProjectDetails } from '@shared/types'

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
  kind: 'mod' | 'modpack'
  onClose: () => void
  action?: {
    label: string
    onClick: () => void
    disabled?: boolean
    loading?: boolean
  }
}): JSX.Element {
  const [details, setDetails] = useState<ModrinthProjectDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeImage, setActiveImage] = useState(0)

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
      if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить информацию')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [projectId])

  useEffect(() => {
    if (!projectId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [projectId, onClose])

  const gallery = useMemo(() => details?.gallery?.filter((image) => image.url) ?? [], [details])
  const versions = details?.game_versions ?? details?.versions ?? []
  const loaders = (details?.loaders ?? []).filter((value) => value && value !== 'minecraft')
  const body = (details?.body ?? '').trim()

  const links = details ? [
    details.source_url ? { label: 'Исходники', url: details.source_url } : null,
    details.issues_url ? { label: 'Проблемы', url: details.issues_url } : null,
    details.wiki_url ? { label: 'Вики', url: details.wiki_url } : null,
    details.discord_url ? { label: 'Discord', url: details.discord_url } : null
  ].filter(Boolean) as Array<{ label: string; url: string }> : []

  return (
    <AnimatePresence>
      {projectId && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={onClose}
            onWheel={(event) => event.stopPropagation()}
          />
          <motion.aside
            className="fixed bottom-3 right-3 top-3 z-50 flex w-full max-w-[540px] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-900/98 shadow-2xl backdrop-blur-xl"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Package size={16} className="text-mint-400" />
                {kind === 'mod' ? 'О моде' : 'О модпаке'}
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5"
              onWheel={(event) => event.stopPropagation()}
            >
              {loading && (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                  <Spinner size={24} />
                  <span className="text-sm">Загрузка информации...</span>
                </div>
              )}

              {!loading && error && (
                <EmptyState icon={<Package size={22} />} title="Не удалось загрузить" description={error} />
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
                      <p className="mt-1 text-sm leading-relaxed text-slate-400">{details.description}</p>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                        <span className="inline-flex items-center gap-1.5"><Download size={13} className="text-mint-400" /> {formatDownloads(details.downloads)} загрузок</span>
                        <span className="inline-flex items-center gap-1.5"><Heart size={13} className="text-rose-400" /> {formatDownloads(followersOf(details))} подписчиков</span>
                      </div>
                    </div>
                  </div>

                  {action && (
                    <Button
                      variant="primary"
                      className="w-full"
                      disabled={action.disabled || action.loading}
                      onClick={action.onClick}
                    >
                      {action.loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                      {action.loading ? 'Установка...' : action.label}
                    </Button>
                  )}

                  {gallery.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                        <ImageIcon size={14} /> Скриншоты
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
                      Скриншотов у проекта нет
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <Tag size={14} /> Категории и совместимость
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {details.categories.map((category) => <Badge key={category}>{category}</Badge>)}
                      {!details.categories.length && <span className="text-xs text-slate-600">Нет категорий</span>}
                    </div>
                    {(loaders.length > 0 || versions.length > 0) && (
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-slate-400">
                        {loaders.length > 0 && (
                          <div className="mb-2">
                            <span className="text-slate-500">Загрузчики: </span>
                            <span className="font-medium text-slate-200">{loaders.map((item) => item.toUpperCase()).join(', ')}</span>
                          </div>
                        )}
                        {versions.length > 0 && (
                          <div>
                            <span className="text-slate-500">Версии игры: </span>
                            <span className="font-medium text-slate-200">
                              {versions.slice(0, 12).join(', ')}{versions.length > 12 ? ` и ещё ${versions.length - 12}` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {body && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                        <Globe size={14} /> Описание
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-300">{body}</pre>
                      </div>
                    </div>
                  )}

                  {links.length > 0 && (
                    <div className="space-y-2 pb-2">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Ссылки</div>
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
        </>
      )}
    </AnimatePresence>
  )
}
