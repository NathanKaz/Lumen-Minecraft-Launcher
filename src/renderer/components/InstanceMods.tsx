import { useEffect, useMemo, useState } from 'react'
import { formatSize, t } from '../lib/i18n'
import { motion } from 'framer-motion'
import { AlertTriangle, Check, ChevronDown, Download, FolderPlus, Loader2, Power, RefreshCw, Search, SlidersHorizontal, Trash2, Upload, Wrench } from 'lucide-react'
import { api } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, Button, EmptyState, Modal, Select, Spinner, Toggle } from './ui'
import { CategoryTags } from './CategoryTags'
import { ProjectDetailPanel } from './ProjectDetailPanel'
import type { ModInfo, ModIssue, ModIssueType, ModUpdateInfo, ModrinthProject } from '@shared/types'

const PAGE_SIZE = 24

/** Popular Modrinth mod categories, combined with AND when several are selected. */
const MOD_CATEGORIES = [
  { id: 'adventure', label: 'Приключения' },
  { id: 'decoration', label: 'Оформление' },
  { id: 'economy', label: 'Экономика' },
  { id: 'equipment', label: 'Снаряжение' },
  { id: 'food', label: 'Еда' },
  { id: 'game-mechanics', label: 'Игровые механики' },
  { id: 'magic', label: 'Магия' },
  { id: 'mobs', label: 'Мобы' },
  { id: 'optimization', label: 'Оптимизация' },
  { id: 'storage', label: 'Хранение' },
  { id: 'technology', label: 'Технические моды' },
  { id: 'transportation', label: 'Транспорт' },
  { id: 'utility', label: 'Утилиты' },
  { id: 'worldgen', label: 'Генерация мира' }
]

function formatDownloads(value: number): string {
  if (value > 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value > 1e3) return `${(value / 1e3).toFixed(0)}K`
  return String(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function InstanceMods({ profileId }: { profileId: string }): JSX.Element {
  const { state, versions, busy, setBusy, refresh, pushToast } = useLauncher()
  const profile = state?.profiles.find((item) => item.id === profileId) ?? null
  const [tab, setTab] = useState<'catalog' | 'installed'>('catalog')
  const [query, setQuery] = useState('')
  const [gameVersion, setGameVersion] = useState(profile?.versionId ?? '')
  const [activeCategories, setActiveCategories] = useState<string[]>([])
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
  const [showUpdatePreview, setShowUpdatePreview] = useState(false)
  const [previewSelected, setPreviewSelected] = useState<string[]>([])
  const [updateResult, setUpdateResult] = useState<{ updated: number; failed: number } | null>(null)

  const versionFilter = gameVersion || undefined
  const loaderFilter = matchLoader ? profile?.loader : undefined
  const categoryKey = activeCategories.join(',')
  const versionOptions = useMemo(() => [...new Set([
    ...(profile?.versionId ? [profile.versionId] : []),
    ...(versions?.versions ?? []).filter((entry) => entry.type === 'release').slice(0, 30).map((entry) => entry.id)
  ])], [profile?.versionId, versions?.versions])
  const installedProjects = useMemo(
    () => new Set(mods.map((mod) => mod.projectId).filter((id): id is string => Boolean(id))),
    [mods]
  )

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
    setGameVersion(profile?.versionId ?? '')
    setActiveCategories([])
    setSelectedFiles([])
    setModUpdates([])
    setPreviewSelected([])
    setUpdateResult(null)
    setShowUpdatePreview(false)
  }, [profileId, state?.installedVersions.length])

  // Diagnostics depend on the instance loader and the installed files. Re-run when
  // either changes so switching from Forge to Fabric does not leave a stale warning.
  const modSignature = mods.map((mod) => `${mod.fileName}:${mod.enabled ? 1 : 0}`).join('|')
  useEffect(() => {
    if (tab === 'installed') void loadIssues()
  }, [tab, profileId, profile?.loader, modSignature])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      void api.searchMods(query, versionFilter, loaderFilter, 0, activeCategories).then((result) => {
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
  }, [query, versionFilter, loaderFilter, categoryKey])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const result = await api.searchMods(query, versionFilter, loaderFilter, offset, activeCategories)
      setProjects((current) => [...current, ...result])
      setOffset((current) => current + result.length)
      setHasMore(result.length >= PAGE_SIZE)
    } finally {
      setLoadingMore(false)
    }
  }

  const install = async (projectId: string, versionId?: string) => {
    if (installing || installedProjects.has(projectId)) return
    setInstalling(projectId)
    setBusy(true)
    try {
      await api.installMod(profileId, projectId, versionId)
      await refreshMods()
      pushToast('success', t("Мод добавлен в сборку"))
    } finally {
      setInstalling(null)
      setBusy(false)
    }
  }

  const removeProject = async (projectId: string) => {
    const installed = mods.filter((mod) => mod.projectId === projectId)
    if (!installed.length) return
    setBusy(true)
    try {
      for (const mod of installed) await api.deleteMod(profileId, mod.fileName)
      await refreshMods()
      pushToast('success', t('Мод удалён из сборки'))
    } finally {
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

  const openUpdatePreview = () => {
    setShowUpdates(true)
    setPreviewSelected(modUpdates.map((update) => update.fileName))
    setUpdateResult(null)
    setShowUpdatePreview(true)
  }

  const closeUpdatePreview = () => {
    if (updatingAll) return
    setShowUpdatePreview(false)
    setUpdateResult(null)
  }

  const togglePreviewUpdate = (fileName: string) => {
    setPreviewSelected((current) => current.includes(fileName)
      ? current.filter((entry) => entry !== fileName)
      : [...current, fileName])
  }

  const applySelectedUpdates = async () => {
    const selected = modUpdates.filter((update) => previewSelected.includes(update.fileName))
    if (!selected.length || updatingAll) return
    const allSelected = selected.length === modUpdates.length
    setBusy(true)
    setUpdatingAll(true)
    setUpdateResult(null)
    const updated: string[] = []
    const failed: string[] = []
    try {
      if (allSelected) {
        // updateAllMods creates an automatic backup on the main-process side.
        const result = await api.updateAllMods(profileId)
        updated.push(...result.updated)
        failed.push(...result.failed)
      } else {
        try {
          await api.createBackup(profileId)
        } catch (error) {
          pushToast('error', t('Не удалось создать автобэкап: {error}', { error: errorMessage(error) }))
          return
        }
        for (const update of selected) {
          try {
            await api.updateMod(profileId, update.fileName, update.projectId)
            updated.push(update.fileName)
          } catch (error) {
            failed.push(update.fileName)
            pushToast('error', t('Не удалось обновить мод {name}: {error}', {
              name: update.name,
              error: errorMessage(error)
            }))
          }
        }
      }
      await refresh()
      await refreshMods()
      setModUpdates((current) => current.filter((entry) => !updated.includes(entry.fileName)))
      setPreviewSelected((current) => current.filter((entry) => !updated.includes(entry)))
      if (failed.length) {
        setUpdateResult({ updated: updated.length, failed: failed.length })
        pushToast('info', t('Обновлено: {updated}, не удалось: {failed}', {
          updated: updated.length,
          failed: failed.length
        }))
      } else {
        pushToast('success', t('Обновления применены'))
        setShowUpdatePreview(false)
        setUpdateResult(null)
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
        <Button onClick={openUpdatePreview} disabled={updatingAll || checkingUpdates || busy}>
          <RefreshCw size={15} /> {t('Обновить все')}
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
              <Select
                className="w-44"
                value={gameVersion}
                onChange={setGameVersion}
                options={[
                  { value: '', label: t('Все версии') },
                  ...versionOptions.map((version) => ({ value: version, label: `Minecraft ${version}` }))
                ]}
              />
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

      {tab === 'catalog' && (
        <CategoryTags
          categories={MOD_CATEGORIES}
          active={activeCategories}
          onChange={setActiveCategories}
        />
      )}

      {tab === 'catalog' ? (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            {loading && !projects.length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="panel shimmer h-44 animate-shimmer" />
            ))}
          </div>
            ) : projects.length ? (
              <>
                <div className={`grid gap-4 sm:grid-cols-2 ${selectedProjectId ? 'xl:grid-cols-2' : 'xl:grid-cols-3'}`}>
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
                  {installedProjects.has(project.project_id) ? (
                    <div className="mt-4 flex gap-2">
                      <Button variant="primary" className="flex-1" disabled title={t('Мод уже установлен в эту сборку')}>
                        <Check size={15} /> {t('Установлен')}
                      </Button>
                      <Button
                        variant="danger"
                        className="flex-1"
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation()
                          void removeProject(project.project_id)
                        }}
                      >
                        <Trash2 size={15} /> {t('Удалить')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="primary"
                      className="mt-4 w-full"
                      disabled={busy || installing !== null}
                      onClick={(event) => {
                        event.stopPropagation()
                        void install(project.project_id)
                      }}
                    >
                      {installing === project.project_id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                      {installing === project.project_id ? t("Установка...") : t("Установить")}
                    </Button>
                  )}
                </motion.div>
              ))}
            </div>
            <div className="mt-5 flex flex-col items-center gap-2">
              {loadingMore && <Spinner size={18} />}
              {hasMore && !loadingMore && (
                <Button onClick={() => void loadMore()}><ChevronDown size={15} /> {t("Показать ещё")}</Button>
              )}
              <span className="text-[10px] text-slate-600">
                {versionFilter
                  ? t('Показано {count} · только для Minecraft {version}', { count: projects.length, version: versionFilter })
                  : t('Показано {count} · все версии Minecraft', { count: projects.length })}
              </span>
            </div>
              </>
            ) : (
              <EmptyState
                icon={<Search size={22} />}
                title={t("Ничего не найдено")}
                description={t("Попробуйте другой запрос или отключите фильтры.")}
              />
            )}
          </div>

          <ProjectDetailPanel
            projectId={selectedProjectId}
            kind="mod"
            onClose={() => setSelectedProjectId(null)}
            action={selectedProjectId ? {
              label: t("Установить в сборку"),
              onClick: (versionId) => void install(selectedProjectId, versionId),
              disabled: busy,
              loading: installing === selectedProjectId,
              installed: installedProjects.has(selectedProjectId),
              onDelete: () => void removeProject(selectedProjectId)
            } : undefined}
          />
        </div>
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
                      <Badge tone="iris">{(mod.loaders ?? [mod.loader]).join(' / ')}</Badge>
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

      <Modal
        open={showUpdatePreview}
        onClose={closeUpdatePreview}
        title={t('Предпросмотр обновлений')}
        width="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button className="px-3 py-1.5 text-[11px]" onClick={() => setPreviewSelected(modUpdates.map((update) => update.fileName))} disabled={updatingAll || !modUpdates.length}>
              {t('Выбрать все')}
            </Button>
            <Button className="px-3 py-1.5 text-[11px]" onClick={() => setPreviewSelected([])} disabled={updatingAll || !previewSelected.length}>
              {t('Снять выделение')}
            </Button>
            <span className="text-[11px] text-slate-400">{t('Выбрано обновлений: {count}', { count: previewSelected.length })}</span>
            <span className="text-[11px] text-slate-600">/ {t('Доступно обновлений модов: {count}', { count: modUpdates.length })}</span>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-[11px] leading-relaxed text-amber-200">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
            <div className="space-y-1">
              <div>{t('Перед обновлением будет создана резервная копия')}</div>
              <div>{t('Выбранные моды будут заменены новыми версиями.')}</div>
            </div>
          </div>

          {modUpdates.length ? (
            <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
              {modUpdates.map((update) => (
                <label key={update.fileName} className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-white/[0.12]">
                  <input
                    type="checkbox"
                    checked={previewSelected.includes(update.fileName)}
                    onChange={() => togglePreviewUpdate(update.fileName)}
                    disabled={updatingAll}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-mint-400"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-slate-100">{update.name}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {t('Текущая версия')}: v{update.currentVersion} → {t('Новая версия')}: v{update.latestVersion}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-[11px] text-slate-500">{t('Все моды актуальны')}</div>
          )}

          {updateResult && (
            <div className="rounded-xl border border-iris-400/25 bg-iris-400/10 p-3 text-[11px] font-semibold text-iris-300">
              {t('Обновлено: {updated}, не удалось: {failed}', updateResult)}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4">
            <Button onClick={closeUpdatePreview} disabled={updatingAll}>{t('Отмена')}</Button>
            <Button variant="primary" onClick={() => void applySelectedUpdates()} disabled={updatingAll || !previewSelected.length}>
              {updatingAll ? <Spinner size={15} /> : <Download size={15} />}
              {updatingAll ? t('Обновление модов...') : t('Обновить выбранные')}
            </Button>
          </div>
        </div>
      </Modal>

      {busy && installing && <div className="fixed bottom-6 left-1/2 -translate-x-1/2"><Spinner /></div>}
    </div>
  )
}
