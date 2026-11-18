import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight, Box, Clock3, Download, FolderOpen, Gamepad2, Layers3, Play, Square, Wrench, Zap
} from 'lucide-react'
import { api } from '../lib/api'
import { selectedProfile, useLauncher } from '../store'
import { Badge, Button, ProgressBar, Spinner } from '../components/ui'
import type { ModInfo, ProgressPhase } from '@shared/types'

const phaseNames: Record<ProgressPhase, string> = {
  version: 'Версия',
  libraries: 'Библиотеки',
  assets: 'Ассеты',
  loader: 'Загрузчик',
  mod: 'Мод',
  modpack: 'Сборка',
  launch: 'Запуск'
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 МБ'
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(2)} ГБ`
  return `${(bytes / 1e6).toFixed(1)} МБ`
}

function formatSpeed(speed: number): string {
  return speed > 1e6 ? `${(speed / 1e6).toFixed(1)} МБ/с` : `${Math.round(speed / 1000)} КБ/с`
}

export function Home(): JSX.Element {
  const { state, gameStatus, progress, busy, logs, setBusy, setPage, refresh, pushToast } = useLauncher()
  const profile = selectedProfile(state)
  const [mods, setMods] = useState<ModInfo[]>([])

  useEffect(() => {
    if (!profile) return
    void api.listMods(profile.id).then(setMods).catch(() => setMods([]))
  }, [profile?.id, state?.installedVersions.length])

  const installed = useMemo(() => {
    if (!profile) return false
    return state?.installedVersions.includes(profile.loaderVersionId ?? profile.versionId) ?? false
  }, [profile, state?.installedVersions])

  const handleInstall = async () => {
    if (!profile) return
    setBusy(true)
    try {
      await api.installProfile(profile.id)
      await refresh()
      pushToast('success', 'Установка завершена')
    } finally {
      setBusy(false)
    }
  }

  const handlePlay = async () => {
    if (!profile) return
    if (gameStatus === 'running' || gameStatus === 'starting') {
      await api.stopGame()
      return
    }
    if (!installed) {
      await handleInstall()
      return
    }
    setBusy(true)
    try {
      await api.launch(profile.id)
    } finally {
      setBusy(false)
    }
  }

  if (!profile) {
    return <div className="panel p-10 text-center text-slate-400">Создайте профиль, чтобы начать игру.</div>
  }

  const isPlaying = gameStatus === 'running' || gameStatus === 'starting'
  const enabledMods = mods.filter((mod) => mod.enabled).length

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-mint-400">Приветствую, {state?.account.name}</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-white">Готовы к приключению?</h1>
          <p className="subtitle mt-2">Управляйте версиями, модами и сборками из одного места.</p>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Badge tone="mint"><span className="h-1.5 w-1.5 rounded-full bg-mint-400" /> Система готова</Badge>
          <Badge tone="iris">v1.0.0</Badge>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(600px_300px_at_82%_20%,rgba(124,58,237,0.28),transparent_65%)]" />
        <div className="absolute inset-0 grid-overlay opacity-60" />
        <div className="pointer-events-none absolute -right-10 -top-14 h-72 w-72 opacity-30 blur-2xl">
          <div className="h-full w-full rotate-12 rounded-[48px] bg-gradient-to-br from-mint-400 via-iris-500 to-transparent" />
        </div>

        <div className="relative grid gap-8 p-8 lg:grid-cols-[1fr_300px]">
          <div className="flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="mint"><Gamepad2 size={12} /> Активный профиль</Badge>
                <Badge>Minecraft {profile.versionId}</Badge>
                <Badge tone="iris">{profile.loader.toUpperCase()}</Badge>
                {profile.modpack && <Badge tone="amber"><Layers3 size={12} /> {profile.modpack.name}</Badge>}
              </div>
              <h2 className="mt-5 text-4xl font-black tracking-tight text-white">{profile.name}</h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-400">
                {installed
                  ? 'Всё установлено и готово. Нажмите «Играть», чтобы запустить ваш мир.'
                  : 'Эта версия ещё не установлена. Лаунчер скачает клиент, библиотеки и ассеты автоматически.'}
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => void handlePlay()}
                disabled={busy || gameStatus === 'crashed'}
                className="group relative inline-flex h-14 items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-mint-400 to-mint-300 px-7 text-base font-extrabold text-ink-950 shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-[0_0_48px_rgba(52,211,153,0.4)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="absolute inset-0 -translate-x-full bg-white/25 transition-transform duration-500 group-hover:translate-x-full" />
                {busy || gameStatus === 'starting' ? <Spinner size={20} /> : isPlaying ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                <span className="relative">
                  {busy ? 'Загрузка...' : gameStatus === 'starting' ? 'Запуск...' : isPlaying ? 'Остановить' : installed ? 'Играть' : 'Установить и играть'}
                </span>
                <ArrowRight size={18} className="relative opacity-60 transition group-hover:translate-x-1" />
              </button>
              <Button onClick={() => void handleInstall()} disabled={busy || isPlaying}>
                <Download size={16} /> {installed ? 'Проверить файлы' : 'Установить'}
              </Button>
            </div>
          </div>

          <div className="relative hidden items-center justify-center lg:flex">
            <div className="relative h-52 w-52">
              <div className="absolute inset-0 rotate-45 rounded-[36px] border border-mint-300/30 bg-gradient-to-br from-mint-400/20 to-iris-500/20 shadow-glow" />
              <div className="absolute inset-6 rotate-45 rounded-[28px] border border-white/10 bg-gradient-to-br from-white/[0.08] to-transparent backdrop-blur" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Box size={72} strokeWidth={1.1} className="text-mint-300/80" />
              </div>
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -right-2 top-4 rounded-xl border border-white/10 bg-ink-900/90 px-3 py-2 text-[10px] font-bold text-slate-200 shadow-panel"
              >
                FPS <span className="text-mint-400">120</span>
              </motion.div>
              <motion.div
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -left-4 bottom-6 rounded-xl border border-white/10 bg-ink-900/90 px-3 py-2 text-[10px] font-bold text-slate-200 shadow-panel"
              >
                {enabledMods} модов
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>

      {progress && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="panel p-5">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint-400/10 text-mint-400"><Zap size={16} /></span>
              <div>
                <div className="text-sm font-bold text-white">{phaseNames[progress.phase]}</div>
                <div className="text-[11px] text-slate-500">{progress.message}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-mint-300">{Math.round(progress.percent)}%</div>
              <div className="text-[10px] text-slate-500">{formatSpeed(progress.speed)}</div>
            </div>
          </div>
          <ProgressBar value={progress.percent} />
          <div className="mt-2 flex justify-between text-[10px] text-slate-600">
            <span>{formatBytes(progress.bytes)} из {formatBytes(progress.totalBytes)}</span>
            <span>{progress.total > 1 ? `${progress.current} / ${progress.total} файлов` : ''}</span>
          </div>
        </motion.div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: Clock3, label: 'Время в игре', value: `${Math.floor(profile.playtimeMinutes / 60)} ч ${profile.playtimeMinutes % 60} мин`, tone: 'text-iris-400' },
          { icon: Wrench, label: 'Активных модов', value: String(enabledMods), tone: 'text-mint-400' },
          { icon: Gamepad2, label: 'Последний запуск', value: profile.lastPlayed ? new Date(profile.lastPlayed).toLocaleDateString('ru-RU') : 'Ещё не запускали', tone: 'text-amber-400' }
        ].map((stat) => (
          <div key={stat.label} className="panel flex items-center gap-4 p-5">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.04] ${stat.tone}`}>
              <stat.icon size={19} />
            </div>
            <div>
              <div className="text-[11px] text-slate-500">{stat.label}</div>
              <div className="mt-0.5 text-sm font-bold text-slate-100">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Быстрые действия</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { icon: Wrench, label: 'Установить мод', page: 'mods' as const },
              { icon: Layers3, label: 'Найти сборку', page: 'modpacks' as const },
              { icon: Box, label: 'Другой профиль', page: 'instances' as const },
              { icon: FolderOpen, label: 'Папка игры', page: null }
            ].map((action) => (
              <button
                key={action.label}
                onClick={() => action.page ? setPage(action.page) : void api.openFolder('instances')}
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
    </div>
  )
}
