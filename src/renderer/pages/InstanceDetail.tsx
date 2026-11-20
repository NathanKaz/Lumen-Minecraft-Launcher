import { useEffect, useState } from 'react'
import { formatSize, getLocale, t } from '../lib/i18n'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Box, Camera, Check, Download, FolderOpen, Gamepad2, Globe2, Image as ImageIcon, Layers3, Pencil, Play,
  Settings, ShieldCheck, Square, Trash2, Wrench, X
} from 'lucide-react'
import { api } from '../lib/api'
import { effectiveMemory, isProfileInstalled } from '../lib/profiles'
import { useLauncher } from '../store'
import { Badge, Button, EmptyState, Modal, Spinner } from '../components/ui'
import { InstallProgress } from '../components/InstallProgress'
import { InstanceMods } from '../components/InstanceMods'
import { ProfileFields } from '../components/ProfileFields'
import { InstanceTools } from '../components/InstanceTools'
import { Worlds } from './Worlds'
import type { Profile, ScreenshotInfo } from '@shared/types'

type Tab = 'mods' | 'worlds' | 'screenshots' | 'tools' | 'settings'

function formatDate(value: number): string {
  return new Date(value).toLocaleString(getLocale() === 'ru' ? 'ru-RU' : 'en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export function InstanceDetail({ profile }: { profile: Profile }): JSX.Element {
  const {
    state, versions, busy, gameStatus, setBusy, refresh, pushToast, backToInstances, removeProfile
  } = useLauncher()
  const [tab, setTab] = useState<Tab>('mods')
  const [draft, setDraft] = useState<Profile | null>({ ...profile })
  const [installing, setInstalling] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(profile.name)
  const [shots, setShots] = useState<ScreenshotInfo[]>([])
  const [shotsLoading, setShotsLoading] = useState(false)
  const [selectedShot, setSelectedShot] = useState<ScreenshotInfo | null>(null)

  useEffect(() => {
    setDraft({ ...profile })
    setNameDraft(profile.name)
    setEditingName(false)
    setTab('mods')
  }, [profile.id, profile.name])

  useEffect(() => {
    let cancelled = false
    setShotsLoading(true)
    void api.listScreenshots(profile.id).then((result) => {
      if (!cancelled) setShots(result)
    }).catch(() => {
      if (!cancelled) setShots([])
    }).finally(() => {
      if (!cancelled) setShotsLoading(false)
    })
    return () => { cancelled = true }
  }, [profile.id, tab])

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
      pushToast('success', t('{name}: установка завершена', { name: current.name }))
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
      pushToast('success', t("Настройки сборки сохранены"))
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
    pushToast('success', t("Сборка переименована"))
  }

  const remove = async () => {
    const removed = await removeProfile(current.id)
    if (removed) backToInstances()
  }

  const removeShot = async (shot: ScreenshotInfo) => {
    await api.deleteScreenshot(shot.profileId, shot.fileName)
    if (selectedShot?.profileId === shot.profileId && selectedShot.fileName === shot.fileName) setSelectedShot(null)
    setShots((currentShots) => currentShots.filter((item) => !(item.profileId === shot.profileId && item.fileName === shot.fileName)))
    pushToast('info', t("Скриншот удалён"))
  }

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <button
        onClick={backToInstances}
        className="flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-mint-300"
      >
        <ArrowLeft size={15} /> {t("Все сборки")}
      </button>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="panel relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(600px_300px_at_82%_20%,rgba(124,58,237,0.22),transparent_65%)]" />
        <div className="absolute inset-0 grid-overlay opacity-60" />
        <div className="relative flex flex-col gap-7 p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="mint"><Gamepad2 size={12} /> {t("Сборка")}</Badge>
              {current.id === state.selectedProfileId && <Badge tone="iris"><Check size={12} /> {t("Активная")}</Badge>}
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
                title={t("Нажмите, чтобы переименовать")}
              >
                <h1 className="truncate text-4xl font-black tracking-tight text-white">{current.name}</h1>
                <Pencil size={16} className="shrink-0 text-slate-600 transition group-hover:text-mint-400" />
              </button>
            )}
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
              {installed
                ? t("Сборка готова. Управляйте модами и настройками или запускайте игру.")
                : t("Клиент ещё не установлен. Лаунчер скачает версию, библиотеки и ассеты автоматически.")}
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-3">
            <button
              onClick={() => void play()}
              disabled={busy || gameStatus === 'crashed'}
              className="group relative inline-flex h-14 items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-mint-400 to-mint-300 px-7 text-base font-extrabold text-ink-950 shadow-glow transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy || installing || gameStatus === 'starting' ? <Spinner size={20} /> : isPlaying ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
              {busy || installing ? t("Загрузка...") : gameStatus === 'starting' ? t("Запуск...") : isPlaying ? t("Остановить") : installed ? t("Играть") : t("Установить и играть")}
            </button>
            {!installed && (
              <Button onClick={() => void install()} disabled={busy || installing}>
                <Download size={16} /> {t("Только установить")}
              </Button>
            )}
            <Button onClick={() => void api.openFolder('mods')}>
              <FolderOpen size={16} /> {t("Папка модов")}
            </Button>
          </div>
        </div>
      </motion.div>

      <InstallProgress />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Gamepad2, label: t("Время в игре"), value: t('{hours} ч {minutes} мин', { hours: Math.floor(current.playtimeMinutes / 60), minutes: current.playtimeMinutes % 60 }), tone: 'text-iris-400' },
          { icon: Wrench, label: t("Память"), value: t('{memory} МБ ({scope})', { memory, scope: t(current.memory === undefined ? 'глобально' : 'своя') }), tone: 'text-mint-400' },
          { icon: Box, label: t("Статус"), value: installed ? t("Установлен") : t("Не установлен"), tone: installed ? 'text-mint-400' : 'text-amber-400' },
          { icon: Layers3, label: t("Последний запуск"), value: current.lastPlayed ? new Date(current.lastPlayed).toLocaleDateString(getLocale() === 'ru' ? 'ru-RU' : 'en-US') : t("Ещё не запускали"), tone: 'text-amber-400' }
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
            { id: 'mods', label: t("Моды"), icon: Wrench },
            { id: 'worlds', label: t("Миры"), icon: Globe2 },
            { id: 'screenshots', label: shots.length ? t('Скриншоты ({count})', { count: shots.length }) : t('Скриншоты'), icon: Camera },
            { id: 'tools', label: t('Инструменты'), icon: ShieldCheck },
            { id: 'settings', label: t("Настройки"), icon: Settings }
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
        <span className="text-[11px] text-slate-600">{t("Изменения сохраняются только для этой сборки")}</span>
      </div>

      <div className="panel p-5">
        {tab === 'mods' && <InstanceMods profileId={current.id} />}
        {tab === 'worlds' && <Worlds profileId={current.id} />}
        {tab === 'tools' && <InstanceTools profile={current} />}
        {tab === 'screenshots' && (
          shotsLoading ? (
            <div className="flex items-center justify-center py-12"><Spinner size={22} /></div>
          ) : shots.length ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>{t('{count} снимков · папка', { count: shots.length })} <span className="font-mono text-slate-400">&lt;instance&gt;/screenshots</span></span>
                <Button onClick={() => void api.openFolder('screenshots')}><FolderOpen size={14} /> {t("Открыть папку")}</Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {shots.map((shot, index) => (
                  <motion.button
                    key={`${shot.profileId}/${shot.fileName}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index, 12) * 0.02 }}
                    onClick={() => setSelectedShot(shot)}
                    className="group overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] text-left transition hover:border-mint-400/30"
                  >
                    <div className="relative aspect-video overflow-hidden bg-ink-950">
                      <img src={shot.dataUrl} alt={shot.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8">
                        <div className="truncate text-xs font-semibold text-white">{shot.name}</div>
                        <div className="text-[10px] text-slate-300">{formatDate(shot.createdAt)}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1.5"><Camera size={12} /> {formatSize(shot.size)}</span>
                      <span>{t("Открыть")}</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon={<ImageIcon size={22} />}
              title={t("Скриншотов пока нет")}
              description={t("Сделайте снимок в игре клавишей F2 — он появится здесь автоматически.")}
              action={<Button onClick={() => void api.openFolder('screenshots')}><FolderOpen size={15} /> {t("Открыть папку")}</Button>}
            />
          )
        )}
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
              <Button variant="danger" onClick={() => void remove()}><Trash2 size={15} /> {t("Удалить сборку")}</Button>
              <Button variant="primary" onClick={() => void saveSettings()} disabled={busy || !draft.name.trim()}>
                {busy ? <Spinner size={14} /> : null} {t('Сохранить настройки')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <Modal open={Boolean(selectedShot)} onClose={() => setSelectedShot(null)} title={selectedShot?.name ?? ''} width="max-w-4xl">
        {selectedShot && (
          <div className="space-y-4">
            <img src={selectedShot.dataUrl} alt={selectedShot.name} className="w-full rounded-xl border border-white/[0.06] object-contain" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <Badge tone="mint">{current.name}</Badge>
                <span>{formatDate(selectedShot.createdAt)}</span>
                <span>· {formatSize(selectedShot.size)}</span>
              </div>
              <div className="flex gap-2">
                <a
                  href={selectedShot.dataUrl}
                  download={selectedShot.fileName}
                  className="btn-ghost inline-flex items-center gap-2"
                >
                  <Download size={15} /> {t("Скачать")}
                </a>
                <Button variant="danger" onClick={() => void removeShot(selectedShot)}>
                  <Trash2 size={15} /> {t("Удалить")}
                </Button>
                <Button onClick={() => setSelectedShot(null)}><X size={15} /> {t("Закрыть")}</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
