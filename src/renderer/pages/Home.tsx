import { getLocale, t } from '../lib/i18n'
import {
  ArrowRight, Boxes, Clock, Download, FolderOpen, Gamepad2, Library, Loader2, Play, Settings, Square
} from 'lucide-react'
import { api } from '../lib/api'
import { selectedProfile, useLauncher } from '../store'
import { useProfileLaunch } from '../hooks/useProfileLaunch'
import { Badge, Button, EmptyState, SectionHeader, Spinner } from '../components/ui'
import type { Profile } from '@shared/types'

function LastPlayedCard({ profile }: { profile: Profile }): JSX.Element {
  const { gameStatus, openProfile } = useLauncher()
  const { current, installed, isPlaying, installing, play } = useProfileLaunch(profile)
  const starting = installing || gameStatus === 'starting'

  return (
    <div className="panel relative overflow-hidden p-6">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-mint-400/[0.07] blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-mint-400/80">
            <Play size={12} /> {t('Последняя запущенная сборка')}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-iris-500/40 to-mint-500/30 text-iris-300">
              <Gamepad2 size={22} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xl font-bold text-white">{current.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Minecraft {current.versionId}</span>
                <Badge tone="slate">{current.loader.toUpperCase()}</Badge>
                <span className={installed ? 'text-mint-400' : 'text-amber-400'}>
                  {installed ? t('Установлен') : t('Не установлен')}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <Clock size={13} /> {t('Последний запуск')}:{' '}
              {current.lastPlayed
                ? new Date(current.lastPlayed).toLocaleString(getLocale() === 'ru' ? 'ru-RU' : 'en-US')
                : t('Ещё не запускали')}
            </span>
            <span className="flex items-center gap-1.5">
              <Gamepad2 size={13} /> {t('Время в игре')}:{' '}
              {t('{hours} ч {minutes} мин', {
                hours: Math.floor(current.playtimeMinutes / 60),
                minutes: current.playtimeMinutes % 60
              })}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Button variant="primary" onClick={() => void play()} disabled={starting}>
            {starting
              ? <Loader2 size={15} className="animate-spin" />
              : isPlaying ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            {starting ? t('Загрузка...') : isPlaying ? t('Остановить') : installed ? t('Играть') : t('Установить и играть')}
          </Button>
          <Button onClick={() => void openProfile(current.id)}>
            <ArrowRight size={14} /> {t('Открыть сборку')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function Home(): JSX.Element {
  const { state, logs, setPage, openProfile } = useLauncher()

  if (!state) return <Spinner />

  const active = selectedProfile(state)
  const lastPlayed = [...state.profiles].sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0]

  return (
    <div className="mx-auto max-w-[1300px]">
      <SectionHeader title={t("Главная")} subtitle={t("Последняя сборка и быстрые действия.")} />

      {lastPlayed ? (
        <LastPlayedCard profile={lastPlayed} />
      ) : (
        <div className="panel p-4">
          <EmptyState
            icon={<Boxes size={22} />}
            title={t("Сборок пока нет")}
            description={t("Создайте первую сборку, чтобы установить Minecraft и моды.")}
            action={<Button variant="primary" onClick={() => setPage('library')}><Library size={16} /> {t("Открыть библиотеку")}</Button>}
          />
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="mb-4 text-sm font-bold text-white">{t("Быстрые действия")}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { icon: Library, label: t("Библиотека сборок"), action: () => setPage('library') },
              { icon: ArrowRight, label: t("Открыть активную сборку"), action: () => active && void openProfile(active.id) },
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
            <button onClick={() => setPage('logs')} className="text-[11px] text-slate-500 transition hover:text-mint-400">{t("Все логи →")}</button>
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
    </div>
  )
}
