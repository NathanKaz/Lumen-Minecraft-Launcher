import { motion } from 'framer-motion'
import { t } from '../lib/i18n'
import { Gamepad2, Image as ImageIcon, LayoutDashboard, Package, Settings, Shirt, ChevronRight } from 'lucide-react'
import { selectedProfile, useLauncher, type Page } from '../store'

// Labels are computed on every render so switching the interface language
// updates the navigation immediately.
const items = (): Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> => [
  { id: 'home', label: t("Главная"), icon: LayoutDashboard },
  { id: 'screenshots', label: t("Скриншоты"), icon: ImageIcon },
  { id: 'skins', label: t("Скины"), icon: Shirt },
  { id: 'modpacks', label: t("Модпаки"), icon: Package },
  { id: 'settings', label: t("Настройки"), icon: Settings }
]

export function Sidebar({ onAccount }: { onAccount: () => void }): JSX.Element {
  const { page, setPage, state, openProfile } = useLauncher()
  const profile = selectedProfile(state)

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
                {active && <span className="relative z-10 ml-auto h-1.5 w-1.5 rounded-full bg-mint-400 shadow-glow" />}
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

        <button
          onClick={onAccount}
          className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 text-left transition hover:border-white/15 hover:bg-white/[0.06]"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-xs font-black text-white">
            {state?.account.name.slice(0, 1).toUpperCase() ?? 'S'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-slate-200">{state?.account.name ?? t("Игрок")}</div>
            <div className="text-[10px] text-slate-500">{state?.account.type === 'offline' ? t("Офлайн-аккаунт") : 'Microsoft'}</div>
          </div>
          <ChevronRight size={14} className="text-slate-600" />
        </button>
      </div>
    </aside>
  )
}
