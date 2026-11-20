import { useEffect, useState } from 'react'
import { formatSize, t } from '../lib/i18n'
import { motion } from 'framer-motion'
import { AlertTriangle, ChevronDown, Download, FolderPlus, Loader2, Power, RefreshCw, Search, SlidersHorizontal, Trash2, Upload, Wrench } from 'lucide-react'
import { api } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, Button, EmptyState, Spinner, Toggle } from './ui'
import { ProjectDetailPanel } from './ProjectDetailPanel'
import type { ModInfo, ModIssue, ModIssueType, ModUpdateInfo, ModrinthProject } from '@shared/types'

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
  const [modUpdates, setModUpdates] = useState<ModUpdateInfo[]>([])
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [showUpdates, setShowUpdates] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [issues, setIssues] = useState<ModIssue[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [updatingAll, setUpdatingAll] = useState(false)

  const versionFilter = matchVersion ? profile?.versionId : undefined
  const loaderFilter = matchLoader ? profile?.loader : undefined

  const loadMods = async () => {
    const result = await api.listMods(profileId)
    setMods(result)
  }

  const loadIssues = async (silent = false) => {
    if (!silent) setAnalyzing(true)
    try {
      setIssues(await api.analyzeMods(profileId))
    } catch {
      if (!silent) setIssues([])
    } finally {
      if (!silent) setAnalyzing(false)
    }
  }

  const refreshMods = async () => {
    await loadMods()
    await loadIssues(true)
  }

  useEffect(() => {
    void loadMods()
    setSelectedFiles([])
  }, [profileId, state?.installedVersions.length])

  useEffect(() => {
    if (tab === 'installed') void loadIssues()
  }, [tab, profileId])

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
      await refreshMods()
      pushToast('success', t("Мод добавлен в сборку"))
    } finally {
      setInstalling(null)
      setBusy(false)
    }
  }

  const installLocal = async () => {
    setBusy(true)
    try {
      await api.installLocalMod(profileId)
      await refreshMods()
      pushToast('success', t("Моды добавлены в сборку"))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (fileName: string) => {
    await api.toggleMod(profileId, fileName)
    await refreshMods()
  }

  const remove = async (fileName: string) => {
    await api.deleteMod(profileId, fileName)
    await refreshMods()
  }

  const toggleSelected = (fileName: string) => {
    setSelectedFiles((current) => current.includes(fileName)
      ? current.filter((entry) => entry !== fileName)
      : [...current, fileName])
  }

  const changeEnabled = async (fileNames: string[], enabled: boolean) => {
    if (!fileNames.length) return
    setBusy(true)
    try {
      await api.setModsEnabled(profileId, fileNames, enabled)
      setSelectedFiles([])
      await refreshMods()
      pushToast('success', t(enabled ? 'Включено модов: {count}' : 'Отключено модов: {count}', { count: fileNames.length }))
    } finally {
      setBusy(false)
    }
  }

  const deleteSelected = async () => {
    const count = selectedFiles.length
    if (!count) return
    if (!window.confirm([
      t('Удалить выбранные моды: {count}', { count }),
      t('Отменить это действие нельзя.')
    ].join('\n'))) return
    setBusy(true)
    try {
      for (const fileName of selectedFiles) await api.deleteMod(profileId, fileName)
      setSelectedFiles([])
      await refreshMods()
      pushToast('success', t('Удалено модов: {count}', { count }))
    } finally {
      setBusy(false)
    }
  }

  const exportList = async () => {
    setBusy(true)
    try {
      await api.exportModList(profileId)
    } finally {
      setBusy(false)
    }
  }

  const importList = async () => {
    setBusy(true)
    try {
      await api.importModList(profileId)
      await refreshMods()
    } finally {
      setBusy(false)
    }
  }

  const checkForUpdates = async () => {
    setCheckingUpdates(true)
    setShowUpdates(true)
    try {
      const updates = await api.checkModUpdates(profileId)
      setModUpdates(updates)
      pushToast(updates.length ? 'info' : 'success', updates.length
        ? t('Доступно обновлений модов: {count}', { count: updates.length })
        : t('Все моды актуальны'))
    } finally {
      setCheckingUpdates(false)
    }
  }

  const applyUpdate = async (update: ModUpdateInfo) => {
    setBusy(true)
    try {
      await api.updateMod(profileId, update.fileName, update.projectId)
      await refreshMods()
      setModUpdates((current) => current.filter((entry) => entry.fileName !== update.fileName))
      pushToast('success', t('Мод обновлён'))
    } finally {
      setBusy(false)
    }
  }

  const updateAll = async () => {
    setBusy(true)
    setUpdatingAll(true)
    setShowUpdates(true)
    try {
      const result = await api.updateAllMods(profileId)
      await refreshMods()
      setModUpdates((current) => current.filter((entry) => !result.updated.includes(entry.fileName)))
      if (!result.updated.length && !result.failed.length) {
        pushToast('success', t('Все моды актуальны'))
      } else {
        pushToast(result.failed.length ? 'info' : 'success', result.failed.length
          ? t('Обновлено модов: {updated}, не удалось: {failed}', {
            updated: result.updated.length,
            failed: result.failed.length
          })
          : t('Обновлено модов: {count}', { count: result.updated.length }))
      }
    } finally {
      setBusy(false)
      setUpdatingAll(false)
    }
  }

  const issueLabels: Record<ModIssueType, string> = {
    duplicate: t('Дубликат'),
    loader: t('Несовместимый загрузчик'),
    version: t('Версия'),
    unknown: t('Неизвестный мод'),
    disabled: t('Отключён')
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
              <span className="relative">{item === 'catalog' ? t("Каталог") : t('Установленные ({count})', { count: mods.length })}</span>
            </button>
          ))}
        </div>
        <Button onClick={() => void installLocal()} disabled={busy}><FolderPlus size={16} /> {t("Из файла")}</Button>
        <Button onClick={() => void checkForUpdates()} disabled={checkingUpdates || busy}>
          {checkingUpdates ? <Spinner size={15} /> : <RefreshCw size={15} />} {t('Проверить обновления')}
        </Button>
        <Button onClick={() => void updateAll()} disabled={updatingAll || checkingUpdates || busy}>
          {updatingAll ? <Spinner size={15} /> : <RefreshCw size={15} />} {t('Обновить все')}
        </Button>
        {tab === 'catalog' && (
          <>
            <div className="relative min-w-[220px] flex-1">
              <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input pl-10"
                placeholder={t("Поиск модов (Sodium, JEI, шейдеры...)")}
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
                title={t('Показывать только моды для Minecraft {version}', { version: profile?.versionId ?? '—' })}
              >
                {t('Версия {version}', { version: profile?.versionId ?? '' })}
              </button>
              <button
                onClick={() => setMatchLoader((value) => !value)}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  matchLoader ? 'border-mint-400/40 bg-mint-400/10 text-mint-300' : 'border-white/[0.08] text-slate-500 hover:text-slate-200'
                }`}
                title={t('Показывать только моды для {loader}', { loader: profile?.loader ?? '—' })}
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
                      <div className="text-[10px] text-slate-500">{t('{count} загрузок', { count: formatDownloads(project.downloads) })}</div>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 min-h-[36px] text-[11px] leading-relaxed text-slate-400">{t(project.description)}</p>
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
              <span className="text-[10px] text-slate-600">
                {t('Показано {count} · фильтры версии и загрузчика выключены по умолчанию', { count: projects.length })}
              </span>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<Search size={22} />}
            title={t("Ничего не найдено")}
            description={t("Попробуйте другой запрос или отключите фильтры версии и загрузчика.")}
          />
        )
      ) : (
        <div className="space-y-4">
          <div className="panel flex flex-wrap items-center gap-2 p-3">
            <Button className="px-3 py-1.5 text-[11px]" onClick={() => setSelectedFiles(mods.map((mod) => mod.fileName))} disabled={busy || !mods.length}>
              {t('Выбрать все')}
            </Button>
            <Button className="px-3 py-1.5 text-[11px]" onClick={() => setSelectedFiles([])} disabled={busy || !selectedFiles.length}>
              {t('Снять выделение')}
            </Button>
            <span className="mx-1 text-[10px] text-slate-500">{t('Выбрано: {count}', { count: selectedFiles.length })}</span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button className="px-3 py-1.5 text-[11px]" onClick={() => void changeEnabled(mods.map((mod) => mod.fileName), true)} disabled={busy || !mods.length}>
                <Power size={14} /> {t('Включить все')}
              </Button>
              <Button className="px-3 py-1.5 text-[11px]" onClick={() => void changeEnabled(mods.map((mod) => mod.fileName), false)} disabled={busy || !mods.length}>
                <Power size={14} /> {t('Отключить все')}
              </Button>
              <Button className="px-3 py-1.5 text-[11px]" onClick={() => void changeEnabled(selectedFiles, true)} disabled={busy || !selectedFiles.length}>
                <Power size={14} /> {t('Включить выбранные')}
              </Button>
              <Button className="px-3 py-1.5 text-[11px]" onClick={() => void changeEnabled(selectedFiles, false)} disabled={busy || !selectedFiles.length}>
                <Power size={14} /> {t('Отключить выбранные')}
              </Button>
              <Button variant="danger" className="px-3 py-1.5 text-[11px]" onClick={() => void deleteSelected()} disabled={busy || !selectedFiles.length}>
                <Trash2 size={14} /> {t('Удалить выбранные')}
              </Button>
              <Button className="px-3 py-1.5 text-[11px]" onClick={() => void exportList()} disabled={busy}>
                <Download size={14} /> {t('Экспорт списка модов')}
              </Button>
              <Button className="px-3 py-1.5 text-[11px]" onClick={() => void importList()} disabled={busy}>
                <Upload size={14} /> {t('Импорт списка модов')}
              </Button>
            </div>
          </div>

          {(analyzing || issues.length > 0 || mods.length > 0) && (
            <div className="panel p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold text-white">
                <AlertTriangle size={15} className="text-amber-400" /> {t('Проблемы')}
                <Badge tone={issues.length ? 'amber' : 'mint'}>{t('Найдено проблем: {count}', { count: issues.length })}</Badge>
                {analyzing && <Spinner size={14} />}
              </div>
              {issues.length ? (
                <div className="space-y-2">
                  {issues.map((issue, index) => (
                    <div key={`${issue.fileName}-${issue.type}-${index}`} className="flex flex-wrap items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                      <Badge tone={['duplicate', 'loader', 'unknown'].includes(issue.type) ? 'amber' : 'slate'}>
                        {issueLabels[issue.type]}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-slate-300">{t(issue.message)}</div>
                        <div className="mt-0.5 truncate text-[10px] text-slate-600">{issue.fileName}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-1 text-[11px] text-slate-500">{t('Проблемы не найдены')}</div>
              )}
            </div>
          )}

          {showUpdates && (
            <div className="panel p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold text-white">
                <RefreshCw size={15} className="text-iris-400" /> {t('Обновления модов')}
              </div>
              {checkingUpdates ? (
                <div className="flex items-center justify-center py-4"><Spinner size={18} /></div>
              ) : modUpdates.length ? (
                <div className="space-y-2">
                  {modUpdates.map((update) => (
                    <div key={update.fileName} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-slate-100">{update.name}</div>
                        <div className="mt-0.5 text-[10px] text-slate-500">v{update.currentVersion} → v{update.latestVersion}</div>
                      </div>
                      <Button onClick={() => void applyUpdate(update)} disabled={busy}>
                        <Download size={14} /> {t('Обновить')}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-2 text-[11px] text-slate-500">{t('Все моды актуальны')}</div>
              )}
            </div>
          )}

          {mods.length ? (
            <div className="panel divide-y divide-white/[0.05] overflow-hidden">
              {mods.map((mod) => (
                <div key={mod.fileName} className="flex items-center gap-4 px-5 py-4 transition hover:bg-white/[0.02]">
                  <input
                    type="checkbox"
                    aria-label={mod.name}
                    checked={selectedFiles.includes(mod.fileName)}
                    onChange={() => toggleSelected(mod.fileName)}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-mint-400"
                  />
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${mod.enabled ? 'bg-mint-400/10 text-mint-400' : 'bg-white/5 text-slate-600'}`}>
                    <Wrench size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`truncate text-sm font-semibold ${mod.enabled ? 'text-slate-100' : 'text-slate-500 line-through'}`}>{mod.name}</span>
                      {mod.version && <Badge>v{mod.version}</Badge>}
                      <Badge tone="iris">{mod.loader}</Badge>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-slate-500">{mod.description ? t(mod.description) : mod.fileName}</div>
                  </div>
                  <span className="hidden text-[10px] text-slate-600 sm:block">{formatSize(mod.size)}</span>
                  <Toggle checked={mod.enabled} onChange={() => void toggle(mod.fileName)} />
                  <button onClick={() => void remove(mod.fileName)} className="rounded-lg p-2 text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-400" title={t("Удалить")}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Power size={22} />}
              title={t("Моды пока не установлены")}
              description={t("Найдите моды в каталоге или добавьте .jar файл вручную.")}
              action={<Button variant="primary" onClick={() => setTab('catalog')}>{t("Открыть каталог")}</Button>}
            />
          )}
        </div>
      )}

      <ProjectDetailPanel
        projectId={selectedProjectId}
        kind="mod"
        onClose={() => setSelectedProjectId(null)}
        action={selectedProjectId ? {
          label: t("Установить в сборку"),
          onClick: () => void install(selectedProjectId),
          disabled: busy,
          loading: installing === selectedProjectId
        } : undefined}
      />

      {busy && installing && <div className="fixed bottom-6 left-1/2 -translate-x-1/2"><Spinner /></div>}
    </div>
  )
}
