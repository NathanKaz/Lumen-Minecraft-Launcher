import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Box, Check, Download, FolderOpen, Gamepad2, Layers3, Pencil, Play,
  Settings, Square, Trash2, Wrench
} from 'lucide-react'
import { api } from '../lib/api'
import { effectiveMemory, isProfileInstalled } from '../lib/profiles'
import { useLauncher } from '../store'
import { Badge, Button, Spinner } from '../components/ui'
import { InstallProgress } from '../components/InstallProgress'
import { InstanceMods } from '../components/InstanceMods'
import { ProfileFields } from '../components/ProfileFields'
import type { Profile } from '@shared/types'

type Tab = 'mods' | 'settings'

export function InstanceDetail({ profile }: { profile: Profile }): JSX.Element {
  const {
    state, versions, busy, gameStatus, setBusy, refresh, pushToast, backToInstances, removeProfile
  } = useLauncher()
  const [tab, setTab] = useState<Tab>('mods')
  const [draft, setDraft] = useState<Profile | null>({ ...profile })
  const [installing, setInstalling] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(profile.name)

  useEffect(() => {
    setDraft({ ...profile })
    setNameDraft(profile.name)
    setEditingName(false)
  }, [profile.id, profile.name])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') backToInstances()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [backToInstances])

  if (!state) return <Spinner />

  const current = state.profiles.find((item) => item.id === profile.id) ?? profile
  const installed = isProfileInstalled(current, state)
  const memory = effectiveMemory(current, state.settings)
  const isPlaying = gameStatus === 'running' || gameStatus === 'starting'

  const install = async () => {
    setInstalling(true)
    setBusy(true)
    try {
      await api.installProfile(current.id)
      await refresh()
      pushToast('success', `${current.name}: установка завершена`)
    } finally {
      setInstalling(false)
      setBusy(false)
    }
  }

  const play = async () => {
    if (isPlaying) {
      await api.stopGame()
      return
    }
    if (!installed) {
      await install()
      return
    }
    setBusy(true)
    try {
      await api.launch(current.id)
    } finally {
      setBusy(false)
    }
  }

  const saveSettings = async () => {
    if (!draft) return
    setBusy(true)
    try {
      await api.updateProfile(current.id, draft)
      await refresh()
      pushToast('success', 'Настройки сборки сохранены')
    } finally {
      setBusy(false)
    }
  }

  const saveName = async () => {
    const name = nameDraft.trim()
    setEditingName(false)
    if (!name || name === current.name) return
    await api.updateProfile(current.id, { name })
    await refresh()
    pushToast('success', 'Сборка переименована')
  }

  const remove = async () => {
    const removed = await removeProfile(current.id)
    if (removed) backToInstances()
  }

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <button
        onClick={backToInstances}
        className="flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-mint-300"
      >
        <ArrowLeft size={15} /> Все сборки
      </button>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="panel relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(600px_300px_at_82%_20%,rgba(124,58,237,0.22),transparent_65%)]" />
        <div className="absolute inset-0 grid-overlay opacity-60" />
        <div className="relative flex flex-col gap-7 p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="mint"><Gamepad2 size={12} /> Сборка</Badge>
              {current.id === state.selectedProfileId && <Badge tone="iris"><Check size={12} /> Активная</Badge>}
              <Badge>Minecraft {current.versionId}</Badge>
              <Badge tone="iris">{current.loader.toUpperCase()}</Badge>
              {current.modpack && <Badge tone="amber"><Layers3 size={12} /> {current.modpack.name}</Badge>}
            </div>
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveName()
                  if (event.key === 'Escape') {
                    setNameDraft(current.name)
                    setEditingName(false)
                  }
                }}
                className="mt-4 w-full max-w-xl rounded-xl border border-mint-400/50 bg-ink-900 px-3 py-1.5 text-4xl font-black tracking-tight text-white outline-none ring-2 ring-mint-400/10"
              />
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="group mt-4 flex max-w-full items-center gap-3 text-left"
                title="Нажмите, чтобы переименовать"
              >
                <h1 className="truncate text-4xl font-black tracking-tight text-white">{current.name}</h1>
                <Pencil size={16} className="shrink-0 text-slate-600 transition group-hover:text-mint-400" />
              </button>
            )}
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
              {installed
                ? 'Сборка готова. Управляйте модами и настройками или запускайте игру.'
                : 'Клиент ещё не установлен. Лаунчер скачает версию, библиотеки и ассеты автоматически.'}
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-3">
            <button
              onClick={() => void play()}
              disabled={busy || gameStatus === 'crashed'}
              className="group relative inline-flex h-14 items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-mint-400 to-mint-300 px-7 text-base font-extrabold text-ink-950 shadow-glow transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy || installing || gameStatus === 'starting' ? <Spinner size={20} /> : isPlaying ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
              {busy || installing ? 'Загрузка...' : gameStatus === 'starting' ? 'Запуск...' : isPlaying ? 'Остановить' : installed ? 'Играть' : 'Установить и играть'}
            </button>
            {!installed && (
              <Button onClick={() => void install()} disabled={busy || installing}>
                <Download size={16} /> Только установить
              </Button>
            )}
            <Button onClick={() => void api.openFolder('mods')}>
              <FolderOpen size={16} /> Папка модов
            </Button>
          </div>
        </div>
      </motion.div>

      <InstallProgress />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Gamepad2, label: 'Время в игре', value: `${Math.floor(current.playtimeMinutes / 60)} ч ${current.playtimeMinutes % 60} мин`, tone: 'text-iris-400' },
          { icon: Wrench, label: 'Память', value: `${memory} МБ ${current.memory === undefined ? '(глобально)' : '(своя)'}`, tone: 'text-mint-400' },
          { icon: Box, label: 'Статус', value: installed ? 'Установлен' : 'Не установлен', tone: installed ? 'text-mint-400' : 'text-amber-400' },
          { icon: Layers3, label: 'Последний запуск', value: current.lastPlayed ? new Date(current.lastPlayed).toLocaleDateString('ru-RU') : 'Ещё не запускали', tone: 'text-amber-400' }
        ].map((stat) => (
          <div key={stat.label} className="panel flex items-center gap-4 p-5">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.04] ${stat.tone}`}>
              <stat.icon size={19} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-500">{stat.label}</div>
              <div className="mt-0.5 truncate text-sm font-bold text-slate-100">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
          {([
            { id: 'mods', label: 'Моды', icon: Wrench },
            { id: 'settings', label: 'Настройки', icon: Settings }
          ] as const).map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`relative flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${tab === item.id ? 'text-mint-300' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {tab === item.id && <motion.span layoutId="instance-section" className="absolute inset-0 rounded-lg bg-mint-400/10" />}
              <item.icon size={14} className="relative z-10" />
              <span className="relative z-10">{item.label}</span>
            </button>
          ))}
        </div>
        <span className="text-[11px] text-slate-600">Изменения сохраняются только для этой сборки</span>
      </div>

      <div className="panel p-5">
        {tab === 'mods' && <InstanceMods profileId={current.id} />}
        {tab === 'settings' && draft && (
          <div className="max-w-2xl space-y-5">
            <ProfileFields
              profile={draft}
              onChange={setDraft}
              versions={versions}
              groups={state.groups}
              settingsMemory={state.settings.memory}
              showMemory
            />
            <div className="flex flex-wrap justify-between gap-2 border-t border-white/[0.06] pt-4">
              <Button variant="danger" onClick={() => void remove()}><Trash2 size={15} /> Удалить сборку</Button>
              <Button variant="primary" onClick={() => void saveSettings()} disabled={busy || !draft.name.trim()}>
                {busy ? <Spinner size={14} /> : null} Сохранить настройки
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
