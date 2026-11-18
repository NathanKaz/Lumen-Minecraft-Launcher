import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight, Boxes, Check, ChevronRight, Download, FolderOpen, Gamepad2, LayoutGrid,
  Layers3, List, Pencil, Play, Plus, Search, Settings, Square, Trash2, Users, Wrench
} from 'lucide-react'
import { api } from '../lib/api'
import { effectiveMemory, isProfileInstalled } from '../lib/profiles'
import { selectedProfile, useLauncher } from '../store'
import { Badge, Button, EmptyState, Modal, SectionHeader, Spinner } from '../components/ui'
import { InstallProgress } from '../components/InstallProgress'
import { ProfileFields } from '../components/ProfileFields'
import type { BuildGroup, Profile } from '@shared/types'

const emptyProfile = (version: string): Profile => ({
  id: crypto.randomUUID(),
  name: 'Новая сборка',
  versionId: version,
  loader: 'fabric',
  createdAt: Date.now(),
  playtimeMinutes: 0
})

function groupTone(color?: string): 'slate' | 'mint' | 'iris' | 'amber' {
  if (color === 'mint' || color === 'iris' || color === 'amber') return color
  return 'slate'
}

export function Instances(): JSX.Element {
  const {
    state, versions, busy, gameStatus, logs, setBusy, refresh, pushToast,
    openProfile, setPage
  } = useLauncher()
  const [editing, setEditing] = useState<Profile | null>(null)
  const [creating, setCreating] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [groupFilter, setGroupFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

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

  const sections = groupFilter === 'all'
    ? [
        ...state.groups.map((group) => ({
          id: group.id,
          label: group.name,
          items: visibleProfiles.filter((profile) => profile.groupId === group.id)
        })),
        {
          id: 'ungrouped',
          label: 'Без группы',
          items: visibleProfiles.filter((profile) => !profile.groupId || !groupsById.has(profile.groupId))
        }
      ].filter((section) => section.items.length > 0)
    : [{
        id: groupFilter,
        label: groupFilter === 'ungrouped' ? 'Без группы' : groupsById.get(groupFilter)?.name ?? 'Группа',
        items: visibleProfiles
      }]

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
      pushToast('success', creating ? 'Сборка создана' : 'Сборка сохранена')
      setEditing(null)
      setCreating(false)
    } finally {
      setBusy(false)
    }
  }

  const install = async (profile: Profile) => {
    setInstalling(profile.id)
    setBusy(true)
    try {
      await api.installProfile(profile.id)
      await refresh()
      pushToast('success', `${profile.name}: установка завершена`)
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

  const remove = async (profile: Profile) => {
    if (!confirm(`Удалить сборку «${profile.name}»? Файлы игры останутся на диске.`)) return
    await api.deleteProfile(profile.id)
    await refresh()
    pushToast('info', 'Сборка удалена')
  }

  const setViewMode = async (mode: 'grid' | 'list') => {
    if (view === mode) return
    await api.setState({ settings: { ...state.settings, instancesView: mode } })
    await refresh()
  }

  const addGroup = async () => {
    const name = newGroupName.trim()
    if (!name) return
    const group: BuildGroup = { id: crypto.randomUUID(), name }
    await api.setState({ groups: [...state.groups, group] })
    await refresh()
    setNewGroupName('')
  }

  const renameGroup = async (group: BuildGroup) => {
    const name = prompt('Название группы', group.name)?.trim()
    if (!name || name === group.name) return
    await api.setState({ groups: state.groups.map((item) => (item.id === group.id ? { ...item, name } : item)) })
    await refresh()
  }

  const deleteGroup = async (group: BuildGroup) => {
    if (!confirm(`Удалить группу «${group.name}»? Сборки останутся без группы.`)) return
    await api.setState({
      groups: state.groups.filter((item) => item.id !== group.id),
      profiles: state.profiles.map((profile) =>
        profile.groupId === group.id ? { ...profile, groupId: undefined } : profile
      )
    })
    if (groupFilter === group.id) setGroupFilter('all')
    await refresh()
  }

  const renderCard = (profile: Profile) => {
    const installed = isProfileInstalled(profile, state)
    const active = profile.id === state.selectedProfileId
    const group = profile.groupId ? groupsById.get(profile.groupId) : null
    const isPlaying = (gameStatus === 'running' || gameStatus === 'starting') && active
    const memory = effectiveMemory(profile, state.settings)

    return (
      <motion.div
        key={profile.id}
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        role="button"
        tabIndex={0}
        onClick={() => void openProfile(profile.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            void openProfile(profile.id)
          }
        }}
        className={`panel relative cursor-pointer overflow-hidden p-5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-mint-400/40 ${
          active ? 'border-mint-400/35 shadow-glow' : 'hover:border-white/15'
        } ${view === 'grid' ? 'flex flex-col' : 'flex items-center gap-5'}`}
      >
        <div className={`absolute inset-x-0 top-0 h-1 ${active ? 'bg-gradient-to-r from-mint-400 to-iris-500' : 'bg-white/5'}`} />

        <div className={`flex min-w-0 items-start gap-3 ${view === 'list' ? 'flex-1' : ''}`}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-iris-500/25 to-mint-500/20 text-iris-400">
            {profile.modpack ? <Layers3 size={20} /> : <Gamepad2 size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-bold text-white">{profile.name}</span>
              {active && <Badge tone="mint"><Check size={11} /> Активная</Badge>}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">Minecraft {profile.versionId}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="iris">{profile.loader.toUpperCase()}</Badge>
              <Badge tone={installed ? 'mint' : 'slate'}>{installed ? 'Установлен' : 'Не установлен'}</Badge>
              {group && <Badge tone={groupTone(group.color)}>{group.name}</Badge>}
              {profile.modpack && <Badge tone="amber">{profile.modpack.name}</Badge>}
            </div>
          </div>
        </div>

        <div className={`flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500 ${
          view === 'grid' ? 'mt-4 border-t border-white/[0.06] pt-4' : 'w-52 shrink-0'
        }`}>
          <span>{profile.playtimeMinutes} мин в игре</span>
          <span>{memory} МБ RAM {profile.memory === undefined && <span className="text-slate-600">(глобально)</span>}</span>
        </div>

        <div className={`flex flex-wrap gap-2 ${view === 'grid' ? 'mt-4' : 'shrink-0'}`}>
          <Button
            onClick={(event) => { event.stopPropagation(); void launch(profile) }}
            disabled={busy || installing === profile.id}
            variant={installed ? 'primary' : 'ghost'}
            className="flex-1"
          >
            {installing === profile.id ? <Spinner size={14} /> : isPlaying ? <Square size={14} fill="currentColor" /> : <Play size={14} />}
            {installing === profile.id ? 'Установка...' : isPlaying ? 'Остановить' : installed ? 'Играть' : 'Установить'}
          </Button>
          <button
            onClick={(event) => { event.stopPropagation(); setEditing({ ...profile }); setCreating(false) }}
            className="rounded-xl border border-white/[0.08] p-2.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            title="Изменить"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={(event) => { event.stopPropagation(); void remove(profile) }}
            className="rounded-xl border border-white/[0.08] p-2.5 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
            title="Удалить"
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={(event) => { event.stopPropagation(); void openProfile(profile.id) }}
            className="rounded-xl border border-white/[0.08] p-2.5 text-slate-400 transition hover:bg-mint-400/10 hover:text-mint-300"
            title="Открыть сборку"
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
        title="Мои сборки"
        subtitle="Нажмите на сборку, чтобы открыть её: моды, настройки и запуск в одном месте."
        action={<Button variant="primary" onClick={openCreate}><Plus size={16} /> Создать сборку</Button>}
      />

      {state.profiles.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'all', label: 'Все' },
              { id: 'ungrouped', label: 'Без группы' },
              ...state.groups.map((group) => ({ id: group.id, label: group.name }))
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
              title="Управление группами"
            >
              <Users size={14} /> Группы
            </button>
          </div>

          <div className="relative ml-auto w-full max-w-[230px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input py-2 pl-10 text-xs"
              placeholder="Поиск сборки"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="flex rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
            <button
              onClick={() => void setViewMode('grid')}
              className={`rounded-lg p-2 transition ${view === 'grid' ? 'bg-mint-400/10 text-mint-300' : 'text-slate-500 hover:text-slate-200'}`}
              title="Сетка"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => void setViewMode('list')}
              className={`rounded-lg p-2 transition ${view === 'list' ? 'bg-mint-400/10 text-mint-300' : 'text-slate-500 hover:text-slate-200'}`}
              title="Список"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      )}

      <InstallProgress />

      {state.profiles.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<Boxes size={22} />}
            title="Пока нет сборок"
            description="Создайте первую сборку, чтобы установить Minecraft и моды."
            action={<Button variant="primary" onClick={openCreate}><Plus size={16} /> Создать сборку</Button>}
          />
        </div>
      ) : visibleProfiles.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={<Search size={22} />} title="Сборки не найдены" description="Измените запрос или выберите другую группу." />
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {sections.map((section) => (
            <div key={section.id}>
              {groupFilter === 'all' && (
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{section.label}</h3>
              )}
              <div className={view === 'grid' ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-3' : 'space-y-3'}>
                {section.items.map(renderCard)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Быстрые действия</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { icon: ArrowRight, label: 'Открыть активную сборку', action: () => activeProfile && void openProfile(activeProfile.id) },
              { icon: FolderOpen, label: 'Папка сборок', action: () => void api.openFolder('instances') },
              { icon: Download, label: 'Найти модпак', action: () => setPage('modpacks') },
              { icon: Settings, label: 'Настройки лаунчера', action: () => setPage('settings') }
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
            <h3 className="text-sm font-bold text-white">Последние события</h3>
            <button onClick={() => setPage('settings')} className="text-[11px] text-slate-500 transition hover:text-mint-400">Все логи →</button>
          </div>
          <div className="space-y-2">
            {logs.slice(-4).reverse().map((log, index) => (
              <div key={`${log.time}-${index}`} className="flex gap-2 rounded-lg bg-white/[0.02] px-3 py-2">
                <span className="shrink-0 font-mono text-[10px] text-slate-600">{new Date(log.time).toLocaleTimeString('ru-RU')}</span>
                <span className={`truncate text-[11px] ${log.level === 'error' ? 'text-rose-400' : 'text-slate-400'}`}>{log.message}</span>
              </div>
            ))}
            {!logs.length && <p className="py-6 text-center text-xs text-slate-600">Событий пока нет</p>}
          </div>
        </div>
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={creating ? 'Новая сборка' : 'Редактирование сборки'}>
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
              <Button onClick={() => setEditing(null)}>Отмена</Button>
              <Button variant="primary" onClick={() => void save()} disabled={busy || !editing.name.trim()}>
                {busy ? <Spinner size={14} /> : null} Сохранить
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={groupsOpen} onClose={() => setGroupsOpen(false)} title="Группы сборок">
        <div className="space-y-4">
          <div className="space-y-2">
            {state.groups.map((group) => (
              <div key={group.id} className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-mint-400/10 text-mint-400"><Users size={15} /></div>
                <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">{group.name}</div>
                <button
                  onClick={() => void renameGroup(group)}
                  className="rounded-lg border border-white/[0.08] p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
                  title="Переименовать"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => void deleteGroup(group)}
                  className="rounded-lg border border-white/[0.08] p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-400"
                  title="Удалить"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {!state.groups.length && <p className="py-6 text-center text-xs text-slate-600">Групп пока нет. Создайте первую ниже.</p>}
          </div>
          <div className="flex gap-2 border-t border-white/[0.06] pt-4">
            <input
              className="input"
              placeholder="Название новой группы"
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void addGroup() }}
            />
            <Button variant="primary" onClick={() => void addGroup()} disabled={!newGroupName.trim()}>
              <Plus size={15} /> Добавить
            </Button>
          </div>
        </div>
      </Modal>

      <div className="mt-5 flex items-center justify-between text-[11px] text-slate-600">
        <span className="flex items-center gap-1.5"><Wrench size={12} /> Моды теперь хранятся внутри каждой сборки</span>
        <span>{state.profiles.length} сборок · {state.groups.length} групп</span>
      </div>
    </div>
  )
}
