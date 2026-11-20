import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { getLocale, t } from '../lib/i18n'
import { motion } from 'framer-motion'
import {
  ArrowRight, Boxes, Check, ChevronRight, Download, FolderOpen, Gamepad2, GripVertical,
  LayoutGrid, Layers3, List, Pencil, Play, Plus, Search, Settings, Square, Trash2, Users, Wrench
} from 'lucide-react'
import { api } from '../lib/api'
import { effectiveMemory, isProfileInstalled } from '../lib/profiles'
import { selectedProfile, useLauncher } from '../store'
import { Badge, Button, EmptyState, Modal, SectionHeader, Spinner } from '../components/ui'
import { InstallProgress } from '../components/InstallProgress'
import { ProfileFields } from '../components/ProfileFields'
import { ContextMenu, type ContextMenuState } from '../components/ContextMenu'
import type { BuildGroup, ImportCandidate, ImportSource, Profile } from '@shared/types'

const DRAG_TYPE = 'application/x-lumen-profile'

const emptyProfile = (version: string): Profile => ({
  id: crypto.randomUUID(),
  name: t("Новая сборка"),
  versionId: version,
  loader: 'fabric',
  createdAt: Date.now(),
  playtimeMinutes: 0
})

function groupTone(color?: string): 'slate' | 'mint' | 'iris' | 'amber' {
  if (color === 'mint' || color === 'iris' || color === 'amber') return color
  return 'slate'
}

function importSourceLabel(source: ImportSource): string {
  if (source === 'official') return t('Официальный')
  if (source === 'curseforge') return t('CurseForge')
  return t('MultiMC / Prism')
}

function importSourceTone(source: ImportSource): 'slate' | 'mint' | 'iris' | 'amber' {
  if (source === 'official') return 'mint'
  if (source === 'curseforge') return 'amber'
  return 'iris'
}

function RenameField({ value, onCommit, onCancel }: {
  value: string
  onCommit: (value: string) => void
  onCancel: () => void
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  const committed = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const commit = () => {
    if (committed.current) return
    committed.current = true
    onCommit(draft)
  }

  return (
    <input
      ref={ref}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') {
          committed.current = true
          onCancel()
        }
      }}
      onBlur={commit}
      className="w-full rounded-lg border border-mint-400/50 bg-ink-900 px-2 py-1 text-sm font-bold text-white outline-none ring-2 ring-mint-400/10"
    />
  )
}

export function Instances(): JSX.Element {
  const {
    state, versions, busy, gameStatus, logs, setBusy, refresh, pushToast,
    openProfile, setPage, removeProfile
  } = useLauncher()
  const [editing, setEditing] = useState<Profile | null>(null)
  const [creating, setCreating] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [groupFilter, setGroupFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renamingGroupName, setRenamingGroupName] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importCandidates, setImportCandidates] = useState<ImportCandidate[]>([])
  const [importScanning, setImportScanning] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)

  if (!state) return <Spinner />

  const view = state.settings.instancesView
  const groupsById = new Map(state.groups.map((group) => [group.id, group]))
  const activeProfile = selectedProfile(state)

  const visibleProfiles = state.profiles.filter((profile) => {
    const matchesGroup =
      groupFilter === 'all' ||
      (groupFilter === 'ungrouped'
        ? !profile.groupId || !groupsById.has(profile.groupId)
        : profile.groupId === groupFilter)
    const normalized = query.trim().toLowerCase()
    const matchesQuery =
      !normalized || `${profile.name} ${profile.versionId} ${profile.loader}`.toLowerCase().includes(normalized)
    return matchesGroup && matchesQuery
  })

  // Every group is rendered, including empty ones — they are drop targets too.
  const allSections: Array<{
    id: string
    label: string
    groupId: string | undefined
    items: Profile[]
  }> = [
    ...state.groups.map((group) => ({
      id: group.id,
      label: group.name,
      groupId: group.id as string | undefined,
      items: visibleProfiles.filter((profile) => profile.groupId === group.id)
    })),
    {
      id: 'ungrouped',
      label: t("Без группы"),
      groupId: undefined,
      items: visibleProfiles.filter((profile) => !profile.groupId || !groupsById.has(profile.groupId))
    }
  ]
  const sections = groupFilter === 'all'
    ? allSections
    : allSections.filter((section) => section.id === groupFilter)

  const openCreate = () => {
    const groupId = groupFilter !== 'all' && groupFilter !== 'ungrouped' ? groupFilter : undefined
    setEditing({ ...emptyProfile(versions?.latest.release ?? '1.20.1'), groupId })
    setCreating(true)
  }

  const save = async () => {
    if (!editing) return
    setBusy(true)
    try {
      if (creating) await api.createProfile(editing)
      else await api.updateProfile(editing.id, editing)
      await refresh()
      pushToast('success', creating ? t("Сборка создана") : t("Сборка сохранена"))
      setEditing(null)
      setCreating(false)
    } finally {
      setBusy(false)
    }
  }

  const rename = async (profile: Profile, value: string) => {
    const name = value.trim()
    if (!name || name === profile.name) return
    await api.updateProfile(profile.id, { name })
    await refresh()
    pushToast('success', t("Сборка переименована"))
  }

  const install = async (profile: Profile) => {
    setInstalling(profile.id)
    setBusy(true)
    try {
      await api.installProfile(profile.id)
      await refresh()
      pushToast('success', t('{name}: установка завершена', { name: profile.name }))
    } finally {
      setInstalling(null)
      setBusy(false)
    }
  }

  const launch = async (profile: Profile) => {
    if (gameStatus === 'running' || gameStatus === 'starting') {
      await api.stopGame()
      return
    }
    if (!isProfileInstalled(profile, state)) {
      await install(profile)
      return
    }
    setBusy(true)
    try {
      await api.launch(profile.id)
    } finally {
      setBusy(false)
    }
  }

  const setViewMode = async (mode: 'grid' | 'list') => {
    if (view === mode) return
    await api.setState({ settings: { ...state.settings, instancesView: mode } })
    await refresh()
  }

  const toggleSelected = (profileId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(profileId)) next.delete(profileId)
      else next.add(profileId)
      return next
    })
  }

  const exportSelected = async () => {
    setBusy(true)
    try {
      const path = await api.exportProfiles([...selectedIds])
      if (path) pushToast('success', t('Сборки экспортированы: {path}', { path }))
      else pushToast('info', t('Экспорт отменён'))
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const importProfiles = async () => {
    setBusy(true)
    try {
      const count = await api.importProfiles()
      if (count > 0) {
        await refresh()
        pushToast('success', t('Импортировано сборок: {count}', { count }))
      }
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const detectImports = async () => {
    setImportScanning(true)
    try {
      const found = await api.detectImportSources()
      setImportCandidates(found)
      setImportOpen(true)
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : String(error))
    } finally {
      setImportScanning(false)
    }
  }

  const importCandidate = async (candidate: ImportCandidate) => {
    setImportingId(candidate.id)
    setBusy(true)
    try {
      const imported = await api.importLauncherProfile(candidate)
      if (imported) {
        await refresh()
        setImportCandidates((current) => current.filter((entry) => entry.id !== candidate.id))
      } else {
        pushToast('error', t('Не удалось импортировать сборку: {name}', { name: candidate.name }))
      }
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : String(error))
    } finally {
      setImportingId(null)
      setBusy(false)
    }
  }

  const backupAll = async () => {
    setBusy(true)
    try {
      const count = await api.backupAllProfiles()
      pushToast(count > 0 ? 'success' : 'info', count > 0
        ? t('Создано бэкапов: {count}', { count })
        : t('Бэкапы не созданы: миры не найдены'))
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const bulkInstall = async () => {
    const targets = state.profiles.filter((profile) => selectedIds.has(profile.id))
    if (targets.length === 0) return
    setBusy(true)
    try {
      for (const profile of targets) {
        setInstalling(profile.id)
        await api.installProfile(profile.id)
      }
      await refresh()
      pushToast('success', t('Установлено сборок: {count}', { count: targets.length }))
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : String(error))
    } finally {
      setInstalling(null)
      setBusy(false)
    }
  }

  const bulkDelete = async () => {
    const targets = state.profiles.filter((profile) => selectedIds.has(profile.id))
    if (targets.length === 0) return
    if (!confirm(t('Удалить выбранные сборки? Миры и моды будут удалены безвозвратно.') +
      ` (${t('Выбрано сборок для удаления: {count}', { count: targets.length })})`)) return
    setBusy(true)
    try {
      for (const profile of targets) await api.deleteProfile(profile.id)
      setSelectedIds(new Set())
      await refresh()
      pushToast('success', t('Удалено сборок: {count}', { count: targets.length }))
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const addGroup = async () => {
    const name = newGroupName.trim()
    if (!name) return
    const group: BuildGroup = { id: crypto.randomUUID(), name }
    await api.setState({ groups: [...state.groups, group] })
    await refresh()
    setNewGroupName('')
  }

  const startRenameGroup = (group: BuildGroup) => {
    setRenamingGroupId(group.id)
    setRenamingGroupName(group.name)
  }

  const commitRenameGroup = async () => {
    if (!renamingGroupId) return
    const group = state.groups.find((item) => item.id === renamingGroupId)
    const name = renamingGroupName.trim()
    setRenamingGroupId(null)
    setRenamingGroupName('')
    if (!group || !name || name === group.name) return
    await api.setState({ groups: state.groups.map((item) => (item.id === group.id ? { ...item, name } : item)) })
    await refresh()
    pushToast('success', t("Группа переименована"))
  }

  const deleteGroup = async (group: BuildGroup) => {
    if (!confirm(t('Удалить группу «{name}»? Сборки останутся без группы.', { name: group.name }))) return
    await api.setState({
      groups: state.groups.filter((item) => item.id !== group.id),
      profiles: state.profiles.map((profile) =>
        profile.groupId === group.id ? { ...profile, groupId: undefined } : profile
      )
    })
    if (groupFilter === group.id) setGroupFilter('all')
    await refresh()
  }

  const openCardMenu = (event: MouseEvent, profile: Profile) => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: t("Открыть сборку"), icon: <ChevronRight size={14} />, onClick: () => void openProfile(profile.id) },
        { label: t("Переименовать"), icon: <Pencil size={14} />, onClick: () => setRenaming({ id: profile.id, value: profile.name }) },
        { label: t("Изменить"), icon: <Settings size={14} />, onClick: () => { setEditing({ ...profile }); setCreating(false) } },
        { label: t("Удалить сборку"), icon: <Trash2 size={14} />, tone: 'danger', onClick: () => void removeProfile(profile.id) }
      ]
    })
  }

  const moveToGroup = async (profileId: string, groupId: string | undefined) => {
    const profile = state.profiles.find((item) => item.id === profileId)
    if (!profile || (profile.groupId ?? '') === (groupId ?? '')) return
    await api.updateProfile(profileId, { groupId })
    await refresh()
    const label = groupId ? groupsById.get(groupId)?.name ?? t("группа") : t("Без группы")
    pushToast('success', `«${profile.name}» → ${label}`)
  }

  const onDragStart = (event: DragEvent, profile: Profile) => {
    event.dataTransfer.setData(DRAG_TYPE, profile.id)
    event.dataTransfer.setData('text/plain', profile.id)
    event.dataTransfer.effectAllowed = 'move'
    setDraggingId(profile.id)
  }

  const onDrop = (event: DragEvent, groupId: string | undefined, sectionId: string) => {
    event.preventDefault()
    const profileId = event.dataTransfer.getData(DRAG_TYPE) || event.dataTransfer.getData('text/plain')
    setDropTarget(null)
    setDraggingId(null)
    if (profileId) void moveToGroup(profileId, groupId)
    else void sectionId
  }

  const renderCard = (profile: Profile) => {
    const installed = isProfileInstalled(profile, state)
    const active = profile.id === state.selectedProfileId
    const group = profile.groupId ? groupsById.get(profile.groupId) : null
    const isPlaying = (gameStatus === 'running' || gameStatus === 'starting') && active
    const memory = effectiveMemory(profile, state.settings)
    const isRenaming = renaming?.id === profile.id

    return (
      <motion.div
        key={profile.id}
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        draggable
        role="button"
        tabIndex={0}
        onClick={() => {
          if (isRenaming) return
          if (selectMode) toggleSelected(profile.id)
          else void openProfile(profile.id)
        }}
        onKeyDown={(event) => {
          if (isRenaming) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            if (selectMode) toggleSelected(profile.id)
            else void openProfile(profile.id)
          }
        }}
        onContextMenu={(event) => openCardMenu(event, profile)}
        onDragStartCapture={(event) => onDragStart(event, profile)}
        onDragEndCapture={() => { setDraggingId(null); setDropTarget(null) }}
        className={`panel relative cursor-pointer overflow-hidden p-5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-mint-400/40 ${
          active ? 'border-mint-400/35 shadow-glow' : 'hover:border-white/15'
        } ${draggingId === profile.id ? 'opacity-40' : ''} ${view === 'grid' ? 'flex flex-col' : 'flex items-center gap-5'}`}
      >
        <div className={`absolute inset-x-0 top-0 h-1 ${active ? 'bg-gradient-to-r from-mint-400 to-iris-500' : 'bg-white/5'}`} />

        {selectMode && (
          <button
            type="button"
            aria-label={t('Выбрать сборки')}
            aria-pressed={selectedIds.has(profile.id)}
            onClick={(event) => { event.stopPropagation(); toggleSelected(profile.id) }}
            className={`absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-md border transition ${
              selectedIds.has(profile.id)
                ? 'border-mint-400 bg-mint-400/20 text-mint-300'
                : 'border-white/15 bg-ink-900/80 text-slate-600 hover:border-white/30'
            }`}
          >
            {selectedIds.has(profile.id) ? <Check size={14} /> : <Square size={13} />}
          </button>
        )}

        <div className={`flex min-w-0 items-start gap-3 ${view === 'list' ? 'flex-1' : ''}`}>
          <div
            onClick={(event) => event.stopPropagation()}
            title={t("Перетащите, чтобы изменить группу")}
            className="-ml-1 mt-1 cursor-grab text-slate-600 transition hover:text-slate-300 active:cursor-grabbing"
          >
            <GripVertical size={16} />
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-iris-500/25 to-mint-500/20 text-iris-400">
            {profile.modpack ? <Layers3 size={20} /> : <Gamepad2 size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {isRenaming ? (
                <RenameField
                  value={renaming.value}
                  onCommit={(value) => { void rename(profile, value); setRenaming(null) }}
                  onCancel={() => setRenaming(null)}
                />
              ) : (
                <span
                  className="truncate font-bold text-white"
                  onDoubleClick={(event) => { event.stopPropagation(); setRenaming({ id: profile.id, value: profile.name }) }}
                  title={t("Двойной клик — переименовать")}
                >
                  {profile.name}
                </span>
              )}
              {active && <Badge tone="mint"><Check size={11} /> {t("Активная")}</Badge>}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">Minecraft {profile.versionId}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="iris">{profile.loader.toUpperCase()}</Badge>
              <Badge tone={installed ? 'mint' : 'slate'}>{installed ? t("Установлен") : t("Не установлен")}</Badge>
              {group && <Badge tone={groupTone(group.color)}>{group.name}</Badge>}
              {profile.modpack && <Badge tone="amber">{profile.modpack.name}</Badge>}
            </div>
          </div>
        </div>

        <div className={`flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500 ${
          view === 'grid' ? 'mt-4 border-t border-white/[0.06] pt-4' : 'w-52 shrink-0'
        }`}>
          <span>{t('{count} мин в игре', { count: profile.playtimeMinutes })}</span>
          <span>{t('{memory} МБ RAM', { memory })} {profile.memory === undefined && <span className="text-slate-600">{t("(глобально)")}</span>}</span>
        </div>

        <div className={`flex flex-wrap gap-2 ${view === 'grid' ? 'mt-4' : 'shrink-0'}`}>
          <Button
            onClick={(event) => { event.stopPropagation(); void launch(profile) }}
            disabled={busy || installing === profile.id}
            variant={installed ? 'primary' : 'ghost'}
            className="flex-1"
          >
            {installing === profile.id ? <Spinner size={14} /> : isPlaying ? <Square size={14} fill="currentColor" /> : <Play size={14} />}
            {installing === profile.id ? t("Установка...") : isPlaying ? t("Остановить") : installed ? t("Играть") : t("Установить")}
          </Button>
          <button
            onClick={(event) => { event.stopPropagation(); void openProfile(profile.id) }}
            className="rounded-xl border border-white/[0.08] p-2.5 text-slate-400 transition hover:bg-mint-400/10 hover:text-mint-300"
            title={t("Открыть сборку")}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <SectionHeader
        title={t("Мои сборки")}
        subtitle={t("Нажмите на сборку, чтобы открыть её. Перетаскивайте карточку между группами, правый клик открывает меню.")}
        action={<Button variant="primary" onClick={openCreate}><Plus size={16} /> {t("Создать сборку")}</Button>}
      />

      {state.profiles.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'all', label: t("Все") },
              ...state.groups.map((group) => ({ id: group.id, label: group.name })),
              { id: 'ungrouped', label: t("Без группы") }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setGroupFilter(item.id)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  groupFilter === item.id
                    ? 'border-mint-400/40 bg-mint-400/10 text-mint-300'
                    : 'border-white/[0.07] bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              onClick={() => setGroupsOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:border-white/20 hover:text-slate-200"
              title={t("Управление группами")}
            >
              <Users size={14} /> {t("Группы")}
            </button>
            <button
              onClick={() => {
                setSelectMode((current) => !current)
                setSelectedIds(new Set())
              }}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                selectMode
                  ? 'border-mint-400/40 bg-mint-400/10 text-mint-300'
                  : 'border-white/[0.07] bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200'
              }`}
            >
              <Check size={14} /> {t("Выбрать сборки")}
            </button>
            <button
              onClick={() => void importProfiles()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:border-white/20 hover:text-slate-200"
            >
              <Download size={14} /> {t("Импорт сборок")}
            </button>
            <button
              onClick={() => void detectImports()}
              disabled={busy || importScanning}
              className="flex items-center gap-1.5 rounded-xl border border-mint-400/25 bg-mint-400/[0.06] px-3 py-1.5 text-xs font-semibold text-mint-300 transition hover:border-mint-400/50 hover:text-mint-200 disabled:opacity-40"
            >
              <Download size={14} /> {t('Импорт')}
            </button>
            <button
              onClick={() => void backupAll()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:border-white/20 hover:text-slate-200"
            >
              <FolderOpen size={14} /> {t("Создать бэкапы всех миров")}
            </button>
          </div>

          <div className="relative ml-auto w-full max-w-[230px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input py-2 pl-10 text-xs"
              placeholder={t("Поиск сборки")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="flex rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
            <button
              onClick={() => void setViewMode('grid')}
              className={`rounded-lg p-2 transition ${view === 'grid' ? 'bg-mint-400/10 text-mint-300' : 'text-slate-500 hover:text-slate-200'}`}
              title={t("Сетка")}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => void setViewMode('list')}
              className={`rounded-lg p-2 transition ${view === 'list' ? 'bg-mint-400/10 text-mint-300' : 'text-slate-500 hover:text-slate-200'}`}
              title={t("Список")}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      )}

      {selectMode && state.profiles.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-mint-400/25 bg-mint-400/[0.06] p-3">
          <span className="mr-auto text-xs font-semibold text-mint-200">{t('Выбрано: {count}', { count: selectedIds.size })}</span>
          <button
            onClick={() => setSelectedIds(new Set(visibleProfiles.map((profile) => profile.id)))}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-mint-400/40 hover:text-mint-300"
          >
            {t("Выбрать все")}
          </button>
          <button
            onClick={() => void exportSelected()}
            disabled={busy || selectedIds.size === 0}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-mint-400/40 hover:text-mint-300 disabled:opacity-40"
          >
            {t("Экспорт сборок")}
          </button>
          <button
            onClick={() => void bulkInstall()}
            disabled={busy || selectedIds.size === 0}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-mint-400/40 hover:text-mint-300 disabled:opacity-40"
          >
            {t("Установить выбранные")}
          </button>
          <button
            onClick={() => void bulkDelete()}
            disabled={busy || selectedIds.size === 0}
            className="rounded-lg border border-rose-400/25 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition hover:border-rose-400/50 disabled:opacity-40"
          >
            {t("Удалить выбранные")}
          </button>
          <button
            onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }}
            className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:text-slate-300"
          >
            {t("Снять выделение")}
          </button>
        </div>
      )}

      <InstallProgress />

      {state.profiles.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<Boxes size={22} />}
            title={t("Пока нет сборок")}
            description={t("Создайте первую сборку, чтобы установить Minecraft и моды.")}
            action={<Button variant="primary" onClick={openCreate}><Plus size={16} /> {t("Создать сборку")}</Button>}
          />
        </div>
      ) : visibleProfiles.length === 0 && groupFilter === 'all' && !query ? (
        <div className="mt-4">
          <EmptyState icon={<Boxes size={22} />} title={t("Сборок пока нет")} description={t("Создайте сборку или переместите сюда существующую.")} />
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {sections.map((section) => (
            <div
              key={section.id}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDropTarget(section.id)
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null)
              }}
              onDrop={(event) => onDrop(event, section.groupId, section.id)}
              className={`rounded-2xl border p-3 transition ${
                dropTarget === section.id
                  ? 'border-mint-400/50 bg-mint-400/[0.05]'
                  : 'border-transparent'
              }`}
            >
              {groupFilter === 'all' && (
                <h3 className="mb-3 flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                  {section.label}
                  <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-slate-600">{section.items.length}</span>
                </h3>
              )}
              {section.items.length ? (
                <div className={view === 'grid' ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-3' : 'space-y-3'}>
                  {section.items.map(renderCard)}
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-white/[0.08] px-4 py-7 text-[11px] text-slate-600">
                  {t("Пусто · перетащите сюда сборку")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="mb-4 text-sm font-bold text-white">{t("Быстрые действия")}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { icon: ArrowRight, label: t("Открыть активную сборку"), action: () => activeProfile && void openProfile(activeProfile.id) },
              { icon: FolderOpen, label: t("Папка сборок"), action: () => void api.openFolder('instances') },
              { icon: Download, label: t("Найти модпак"), action: () => setPage('modpacks') },
              { icon: Settings, label: t("Настройки лаунчера"), action: () => setPage('settings') }
            ].map((action) => (
              <button
                key={action.label}
                onClick={action.action}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-left text-xs font-semibold text-slate-300 transition hover:border-mint-400/25 hover:bg-mint-400/[0.06] hover:text-mint-300"
              >
                <action.icon size={16} /> {action.label}
              </button>
            ))}
          </div>
        </div>

        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">{t("Последние события")}</h3>
            <button onClick={() => setPage('settings')} className="text-[11px] text-slate-500 transition hover:text-mint-400">{t("Все логи →")}</button>
          </div>
          <div className="space-y-2">
            {logs.slice(-4).reverse().map((log, index) => (
              <div key={`${log.time}-${index}`} className="flex gap-2 rounded-lg bg-white/[0.02] px-3 py-2">
                <span className="shrink-0 font-mono text-[10px] text-slate-600">{new Date(log.time).toLocaleTimeString(getLocale() === 'ru' ? 'ru-RU' : 'en-US')}</span>
                <span className={`truncate text-[11px] ${log.level === 'error' ? 'text-rose-400' : 'text-slate-400'}`}>{log.message}</span>
              </div>
            ))}
            {!logs.length && <p className="py-6 text-center text-xs text-slate-600">{t("Событий пока нет")}</p>}
          </div>
        </div>
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={creating ? t("Новая сборка") : t("Редактирование сборки")}>
        {editing && (
          <div className="space-y-5">
            <ProfileFields
              profile={editing}
              onChange={setEditing}
              versions={versions}
              groups={state.groups}
              settingsMemory={state.settings.memory}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setEditing(null)}>{t("Отмена")}</Button>
              <Button variant="primary" onClick={() => void save()} disabled={busy || !editing.name.trim()}>
                {busy ? <Spinner size={14} /> : null} {t('Сохранить')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={groupsOpen}
        onClose={() => {
          setGroupsOpen(false)
          setRenamingGroupId(null)
          setRenamingGroupName('')
        }}
        title={t("Группы сборок")}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            {state.groups.map((group) => (
              <div key={group.id} className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-mint-400/10 text-mint-400"><Users size={15} /></div>
                {renamingGroupId === group.id ? (
                  <input
                    autoFocus
                    value={renamingGroupName}
                    onChange={(event) => setRenamingGroupName(event.target.value)}
                    onBlur={() => void commitRenameGroup()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void commitRenameGroup()
                      if (event.key === 'Escape') {
                        setRenamingGroupId(null)
                        setRenamingGroupName('')
                      }
                    }}
                    className="input min-w-0 flex-1 py-2 text-sm"
                  />
                ) : (
                  <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">{group.name}</div>
                )}
                <button
                  onClick={() => startRenameGroup(group)}
                  className="rounded-lg border border-white/[0.08] p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
                  title={t("Переименовать")}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => void deleteGroup(group)}
                  className="rounded-lg border border-white/[0.08] p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-400"
                  title={t("Удалить")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {!state.groups.length && <p className="py-6 text-center text-xs text-slate-600">{t("Групп пока нет. Создайте первую ниже.")}</p>}
          </div>
          <div className="flex gap-2 border-t border-white/[0.06] pt-4">
            <input
              className="input"
              placeholder={t("Название новой группы")}
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void addGroup() }}
            />
            <Button variant="primary" onClick={() => void addGroup()} disabled={!newGroupName.trim()}>
              <Plus size={15} /> {t("Добавить")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={t('Импорт из других лаунчеров')}
        width="max-w-2xl"
      >
        {importScanning ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500">
            <Spinner size={16} /> {t('Поиск сборок...')}
          </div>
        ) : importCandidates.length ? (
          <div className="space-y-3">
            {importCandidates.map((candidate) => (
              <motion.div
                key={candidate.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="panel flex flex-wrap items-center gap-3 p-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-iris-500/15 text-iris-400">
                  <Download size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-bold text-white">{candidate.name}</span>
                    <Badge tone={importSourceTone(candidate.source)}>{importSourceLabel(candidate.source)}</Badge>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Minecraft {candidate.versionId} · {candidate.loader.toUpperCase()}
                    {candidate.loaderVersionId ? ` · ${candidate.loaderVersionId}` : ''}
                    {candidate.details ? ` · ${candidate.details}` : ''}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-slate-600" title={candidate.path}>{candidate.path}</div>
                </div>
                <Button
                  variant="primary"
                  onClick={() => void importCandidate(candidate)}
                  disabled={busy || importingId !== null}
                >
                  {importingId === candidate.id ? <Spinner size={14} /> : <Download size={14} />}
                  {t('Импортировать')}
                </Button>
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Boxes size={22} />}
            title={t('Сборки не найдены')}
            description={t('Проверьте каталоги MultiMC, Prism Launcher и официального лаунчера или выберите архив CurseForge.')}
          />
        )}
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setImportOpen(false)}>{t('Закрыть')}</Button>
        </div>
      </Modal>

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />

      <div className="mt-5 flex items-center justify-between text-[11px] text-slate-600">
        <span className="flex items-center gap-1.5"><Wrench size={12} /> {t("Моды хранятся внутри каждой сборки · правый клик по карточке — меню")}</span>
        <span>{t('{profiles} сборок · {groups} групп', { profiles: state.profiles.length, groups: state.groups.length })}</span>
      </div>
    </div>
  )
}
