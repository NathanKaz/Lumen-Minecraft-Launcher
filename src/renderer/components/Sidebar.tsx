import { motion } from 'framer-motion'
import {
  ArrowLeft, Camera, ChevronRight, Download, ExternalLink, Gamepad2, Github, Globe2,
  Image as ImageIcon, LayoutDashboard, Library, Loader2, Package, Play, ScrollText, Settings,
  ShieldCheck, Shirt, Sparkles, Square, Wrench
} from 'lucide-react'
import { t } from '../lib/i18n'
import { api } from '../lib/api'
import {
  findProfile, selectedProfile, useLauncher, type Page, type ProfileSection
} from '../store'
import { useProfileLaunch } from '../hooks/useProfileLaunch'
import { APP_REPOSITORY } from '@shared/version'
import type { Profile } from '@shared/types'

function ProjectLink(): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => void api.openExternal(APP_REPOSITORY)}
      title={APP_REPOSITORY}
      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-600 transition hover:bg-white/[0.04] hover:text-mint-300"
    >
      <Github size={12} /> GitHub <ExternalLink size={10} />
    </button>
  )
}

// Labels are computed on every render so switching the interface language
// updates the navigation immediately.
const items = (): Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> => [
  { id: 'home', label: t("Главная"), icon: LayoutDashboard },
  { id: 'library', label: t("Библиотека"), icon: Library },
  { id: 'screenshots', label: t("Скриншоты"), icon: ImageIcon },
  { id: 'skins', label: t("Скины"), icon: Shirt },
  { id: 'modpacks', label: t("Модпаки"), icon: Package },
  { id: 'shaders', label: t('Шейдеры'), icon: Sparkles },
  { id: 'logs', label: t("Логи"), icon: ScrollText },
  { id: 'tasks', label: t("Загрузки"), icon: Download },
  { id: 'settings', label: t("Настройки"), icon: Settings }
]

const profileItems = (): Array<{ id: ProfileSection; label: string; icon: typeof LayoutDashboard }> => [
  { id: 'overview', label: t('Обзор'), icon: LayoutDashboard },
  { id: 'mods', label: t('Моды'), icon: Wrench },
  { id: 'shaders', label: t('Шейдеры'), icon: Sparkles },
  { id: 'worlds', label: t('Миры'), icon: Globe2 },
  { id: 'screenshots', label: t('Скриншоты'), icon: Camera },
  { id: 'tools', label: t('Инструменты'), icon: ShieldCheck },
  { id: 'settings', label: t('Настройки'), icon: Settings }
]

function AccountButton({ onAccount }: { onAccount: () => void }): JSX.Element {
  const { state } = useLauncher()
  return (
    <button
      onClick={onAccount}
      className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 text-left transition hover:border-white/15 hover:bg-white/[0.06]"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-xs font-black text-white">
        {state?.account.name.slice(0, 1).toUpperCase() ?? 'S'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold text-slate-200">{state?.account.name ?? t("Игрок")}</div>
        <div className="text-[10px] text-slate-500">
          {state?.account.type === 'offline' ? t("Офлайн-аккаунт") : t('Microsoft-аккаунт')}
        </div>
        <div className="max-w-[150px] truncate font-mono text-[9px] text-slate-600" title={state?.account.uuid}>
          {state?.account.uuid ?? '—'}
        </div>
      </div>
      <ChevronRight size={14} className="text-slate-600" />
    </button>
  )
}

/** Navigation for an opened instance: the instance becomes a full page of its own. */
function ProfileNavigation({
  profile, onAccount
}: {
  profile: Profile
  onAccount: () => void
}): JSX.Element {
  const { backToInstances, profileSection, setProfileSection, gameStatus } = useLauncher()
  const { installed, isPlaying, installing, play } = useProfileLaunch(profile)
  const launchDisabled = installing || gameStatus === 'crashed' || gameStatus === 'starting'

  return (
    <aside className="flex w-[236px] shrink-0 flex-col border-r border-white/[0.05] bg-ink-900/60 backdrop-blur-xl">
      <div className="px-3 pb-2 pt-5">
        <button
          onClick={backToInstances}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-white/[0.04] hover:text-mint-300"
        >
          <ArrowLeft size={15} /> {t("Все сборки")}
        </button>

        <div className="mx-1 mt-3 rounded-xl border border-mint-400/20 bg-mint-400/[0.05] p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-iris-500/40 to-mint-500/30 text-iris-300">
              <Gamepad2 size={17} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-bold text-white">{profile.name}</div>
              <div className="truncate text-[10px] text-slate-500">{profile.versionId} · {profile.loader}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className={`h-1.5 w-1.5 rounded-full ${installed ? 'bg-mint-400 shadow-glow' : 'bg-amber-400'}`} />
            {installed ? t('Установлен') : t('Не установлен')}
            {isPlaying && <span className="ml-auto text-mint-300">{t('Игра запущена')}</span>}
          </div>
        </div>

        <p className="px-3 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">{t("Сборка")}</p>
        <nav className="space-y-1">
          {profileItems().map((item) => {
            const Icon = item.icon
            const active = profileSection === item.id
            return (
              <button
                key={item.id}
                onClick={() => setProfileSection(item.id)}
                className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'text-mint-300' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="profile-nav-active"
                    className="absolute inset-0 rounded-xl border border-mint-400/20 bg-mint-400/[0.08]"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon size={17} className="relative z-10" />
                <span className="relative z-10">{item.label}</span>
                {active && <span className="relative z-10 ml-auto h-1.5 w-1.5 rounded-full bg-mint-400 shadow-glow" />}
              </button>
            )
          })}
        </nav>

        <button
          onClick={() => void play()}
          disabled={launchDisabled}
          className="mx-1 mt-4 flex w-[calc(100%-0.5rem)] items-center justify-center gap-2 rounded-xl border border-mint-400/25 bg-mint-400/[0.08] px-3 py-2.5 text-xs font-bold text-mint-300 transition hover:bg-mint-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {installing || gameStatus === 'starting'
            ? <Loader2 size={15} className="animate-spin" />
            : isPlaying ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
          {installing || gameStatus === 'starting'
            ? t('Загрузка...')
            : isPlaying ? t('Остановить') : installed ? t('Играть') : t('Установить и играть')}
        </button>
      </div>

      <div className="mt-auto px-3 pb-3">
        <AccountButton onAccount={onAccount} />
        <ProjectLink />
      </div>
    </aside>
  )
}

export function Sidebar({ onAccount }: { onAccount: () => void }): JSX.Element {
  const { page, setPage, state, openProfile, openedProfileId, tasks } = useLauncher()
  const profile = selectedProfile(state)
  const openedProfile = findProfile(state, openedProfileId)
  const activeTasks = tasks.filter((task) => task.status === 'running' || task.status === 'queued' || task.status === 'paused').length

  if (openedProfile) return <ProfileNavigation profile={openedProfile} onAccount={onAccount} />

  return (
    <aside className="flex w-[236px] shrink-0 flex-col border-r border-white/[0.05] bg-ink-900/60 backdrop-blur-xl">
      <div className="px-3 pb-2 pt-5">
        <p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">{t("Навигация")}</p>
        <nav className="space-y-1">
          {items().map((item) => {
            const Icon = item.icon
            const active = page === item.id
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'text-mint-300' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-xl border border-mint-400/20 bg-mint-400/[0.08]"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon size={17} className="relative z-10" />
                <span className="relative z-10">{item.label}</span>
                {item.id === 'tasks' && activeTasks > 0 ? (
                  <span className="relative z-10 ml-auto rounded-full bg-mint-400/15 px-1.5 py-0.5 text-[10px] font-bold text-mint-300">{activeTasks}</span>
                ) : active ? (
                  <span className="relative z-10 ml-auto h-1.5 w-1.5 rounded-full bg-mint-400 shadow-glow" />
                ) : null}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="mt-auto px-3 pb-3">
        <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">{t("Активная сборка")}</div>
        <button
          onClick={() => profile && void openProfile(profile.id)}
          disabled={!profile}
          className="mx-1 mb-3 flex w-[calc(100%-0.5rem)] items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5 text-left transition hover:border-mint-400/25 hover:bg-mint-400/[0.05] disabled:cursor-default disabled:hover:border-white/[0.06] disabled:hover:bg-white/[0.025]"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-iris-500/40 to-mint-500/30 text-iris-400">
            <Gamepad2 size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-slate-200">{profile?.name ?? t("Нет сборки")}</div>
            <div className="truncate text-[10px] text-slate-500">{profile?.versionId} · {profile?.loader}</div>
          </div>
          {profile && <ChevronRight size={13} className="text-slate-600" />}
        </button>

        <AccountButton onAccount={onAccount} />
        <ProjectLink />
      </div>
    </aside>
  )
}
