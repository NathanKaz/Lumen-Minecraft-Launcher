import { useEffect, useState } from 'react'
import { setLocale, t } from './lib/i18n'
import { motion } from 'framer-motion'
import { Check, Loader2, LogOut, Pencil, Plus, RefreshCw, Trash2, UserRound, Users, X } from 'lucide-react'
import { api } from './lib/api'
import { findProfile, useLauncher } from './store'
import { Titlebar } from './components/Titlebar'
import { Sidebar } from './components/Sidebar'
import { ToastHost } from './components/ToastHost'
import { FirstRunWizard } from './components/FirstRunWizard'
import { GlobalSearch } from './components/GlobalSearch'
import { CrashAssistant } from './components/CrashAssistant'
import { Badge, Button, Modal } from './components/ui'
import { SkinsPanel } from './components/SkinsPanel'
import { Home } from './pages/Home'
import { Instances } from './pages/Instances'
import { Logs } from './pages/Logs'
import { InstanceDetail } from './pages/InstanceDetail'
import { Modpacks } from './pages/Modpacks'
import { Screenshots } from './pages/Screenshots'
import { Settings } from './pages/Settings'
import { TasksPage } from './pages/Tasks'
import type { AccountRecord } from '@shared/types'

function MicrosoftMark(): JSX.Element {
  return (
    <span className="grid h-3.5 w-3.5 grid-cols-2 gap-[1px]" aria-hidden="true">
      <span className="bg-[#f25022]" />
      <span className="bg-[#7fba00]" />
      <span className="bg-[#00a4ef]" />
      <span className="bg-[#ffb900]" />
    </span>
  )
}

export default function App(): JSX.Element {
  const {
    state, page, openedProfileId, gameStatus,
    crashProfileId, globalSearchOpen,
    init, refresh, setPage, backToInstances, pushToast,
    setCrashProfileId, setGlobalSearchOpen
  } = useLauncher()
  const [accountOpen, setAccountOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [msaBusy, setMsaBusy] = useState(false)
  const openedProfile = findProfile(state, openedProfileId)

  // Keep translations in sync before children render; all consumers re-render with state.
  setLocale(state?.settings.language ?? 'ru')

  useEffect(() => {
    void init()
  }, [init])

  // New installations (and users who re-run setup from Settings) get the wizard.
  useEffect(() => {
    if (state && !state.settings.onboardingCompleted) setWizardOpen(true)
  }, [state, state?.settings.onboardingCompleted])

  // Ctrl/Cmd+K opens the command palette from anywhere in the launcher.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setGlobalSearchOpen(!globalSearchOpen)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [globalSearchOpen, setGlobalSearchOpen])

  const gameBusy = gameStatus === 'running' || gameStatus === 'starting'

  const switchAccount = async (id: string) => {
    if (!state || id === state.activeAccountId) return
    if (gameBusy) {
      pushToast('error', t('Сначала выключите игру, чтобы переключить профиль.'))
      return
    }
    setPage('library')
    backToInstances()
    setRenamingId(null)
    await api.selectAccount(id)
    await refresh()
    pushToast('success', t('Профиль переключён'))
  }

  const addAccount = async () => {
    const name = newAccountName.trim()
    if (!name) return
    setPage('library')
    backToInstances()
    await api.addAccount(name)
    setNewAccountName('')
    setRenamingId(null)
    await refresh()
    pushToast('success', t('Профиль добавлен'))
  }

  const loginWithMicrosoft = async () => {
    if (!state || msaBusy) return
    setMsaBusy(true)
    setPage('library')
    backToInstances()
    try {
      await api.loginMicrosoft()
      await refresh()
      pushToast('success', t('Профиль Microsoft добавлен'))
    } finally {
      setMsaBusy(false)
    }
  }

  const refreshMicrosoftToken = async (id: string) => {
    if (msaBusy) return
    setMsaBusy(true)
    try {
      await api.refreshMicrosoft(id)
      await refresh()
      pushToast('success', t('Токен Microsoft обновлён'))
    } finally {
      setMsaBusy(false)
    }
  }

  const logoutMicrosoftAccount = async (id: string) => {
    if (msaBusy) return
    setMsaBusy(true)
    try {
      await api.logoutMicrosoft(id)
      await refresh()
      pushToast('success', t('Выполнен выход из Microsoft'))
    } finally {
      setMsaBusy(false)
    }
  }

  const saveRename = async (id: string) => {
    const name = renameValue.trim()
    if (!name) return
    await api.renameAccount(id, name)
    setRenamingId(null)
    await refresh()
    pushToast('success', t('Профиль переименован'))
  }

  const removeAccount = async (account: AccountRecord) => {
    if (!state || state.accounts.length <= 1) return
    const confirmed = await api.confirmDeleteAccount(account.id)
    if (!confirmed) return
    setPage('library')
    backToInstances()
    await api.deleteAccount(account.id)
    if (renamingId === account.id) setRenamingId(null)
    await refresh()
    pushToast('success', t('Профиль удалён'))
  }

  return (
    <div className="app-bg relative flex h-full w-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-40" />
      <Titlebar />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar onAccount={() => setAccountOpen(true)} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="min-h-full p-7">
            {!state ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-500">
                <Loader2 size={30} className="animate-spin text-mint-400" />
                <p className="text-sm">{t("Загрузка лаунчера...")}</p>
              </div>
            ) : (
              <motion.div
                key={openedProfile?.id ?? page}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {openedProfile ? (
                  <InstanceDetail profile={openedProfile} />
                ) : (
                  <>
                    {page === 'home' && <Home />}
                    {page === 'library' && <Instances />}
                    {page === 'screenshots' && <Screenshots />}
                    {page === 'skins' && <SkinsPanel accountId={state.activeAccountId} />}
                    {page === 'modpacks' && <Modpacks />}
                    {page === 'logs' && <Logs />}
                    {page === 'tasks' && <TasksPage />}
                    {page === 'settings' && <Settings />}
                  </>
                )}
              </motion.div>
            )}
          </div>
        </main>
      </div>

      <ToastHost />
      <GlobalSearch />
      <FirstRunWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      {crashProfileId && (
        <CrashAssistant
          profileId={crashProfileId}
          onClose={() => setCrashProfileId(null)}
        />
      )}

      <Modal open={accountOpen} onClose={() => setAccountOpen(false)} title={t("Аккаунт")} width="max-w-2xl">
        {state && (
          <div className="min-w-0">
            <section className="min-w-0 space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-white">
                  <UserRound size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">{state.account.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {state.account.type === 'microsoft'
                      ? t('Лицензированный профиль Minecraft')
                      : t('Офлайн-профиль · без лицензии')}
                  </div>
                </div>
                {state.account.type === 'microsoft' && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label={t('Проверить токен')}
                      title={t('Проверить токен')}
                      disabled={msaBusy || gameBusy}
                      onClick={() => void refreshMicrosoftToken(state.activeAccountId)}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {msaBusy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    </button>
                    <button
                      type="button"
                      aria-label={t('Выйти из Microsoft')}
                      title={t('Выйти из Microsoft')}
                      disabled={msaBusy || gameBusy}
                      onClick={() => void logoutMicrosoftAccount(state.activeAccountId)}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <LogOut size={15} />
                    </button>
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="label mb-0 flex items-center gap-2">
                    <Users size={14} /> {t('Профили игроков')}
                  </div>
                  <span className="max-w-[180px] text-right text-[10px] leading-snug text-slate-600">
                    {t('У каждого профиля свои сборки и скины.')}
                  </span>
                </div>

                <div className="space-y-2">
                  {state.accounts.map((account) => {
                    const active = account.id === state.activeAccountId
                    const isRenaming = renamingId === account.id
                    return (
                      <div
                        key={account.id}
                        className={`flex items-center gap-2 rounded-xl border p-2.5 transition ${
                          active ? 'border-mint-400/35 bg-mint-400/[0.07]' : 'border-white/[0.06] bg-white/[0.02]'
                        }`}
                      >
                        {isRenaming ? (
                          <>
                            <input
                              className="input min-w-0 flex-1"
                              value={renameValue}
                              maxLength={16}
                              autoFocus
                              onChange={(event) => setRenameValue(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') void saveRename(account.id)
                                if (event.key === 'Escape') setRenamingId(null)
                              }}
                            />
                            <button
                              aria-label={t('Сохранить')}
                              onClick={() => void saveRename(account.id)}
                              className="rounded-lg p-1.5 text-mint-300 transition hover:bg-mint-400/10"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              aria-label={t('Отмена')}
                              onClick={() => setRenamingId(null)}
                              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white"
                            >
                              <X size={15} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={gameBusy}
                              onClick={() => void switchAccount(account.id)}
                              className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-iris-500/50 to-amber-500/40 text-xs font-bold text-white">
                                {account.name.slice(0, 1).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-xs font-semibold text-slate-100">{account.name}</span>
                                  {active && <Badge tone="mint">{t('Активный')}</Badge>}
                                </div>
                                <div className="truncate text-[10px] text-slate-500">
                                  {t('Сборок: {count}', { count: account.profiles.length })} ·{' '}
                                  {account.type === 'microsoft'
                                    ? t('Microsoft-аккаунт')
                                    : t('Офлайн-аккаунт')}
                                </div>
                              </div>
                            </button>
                            {account.type === 'offline' && (
                              <button
                                aria-label={t('Переименовать')}
                                onClick={() => { setRenamingId(account.id); setRenameValue(account.name) }}
                                className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white"
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            <button
                              aria-label={t('Удалить профиль игрока')}
                              disabled={state.accounts.length <= 1 || gameBusy}
                              onClick={() => void removeAccount(account)}
                              className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="mt-3 flex gap-2">
                  <input
                    className="input min-w-0 flex-1"
                    value={newAccountName}
                    maxLength={16}
                    placeholder="Steve"
                    onChange={(event) => setNewAccountName(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') void addAccount() }}
                  />
                  <Button variant="primary" onClick={() => void addAccount()} disabled={!newAccountName.trim()}>
                    <Plus size={15} /> {t('Добавить профиль')}
                  </Button>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                      <MicrosoftMark /> {t('Вход через Microsoft')}
                      <Badge tone="amber">{t('Скоро')}</Badge>
                    </div>
                    <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      {t('Вход через Microsoft будет добавлен позже.')}
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    disabled
                    title={t('Вход через Microsoft будет добавлен позже.')}
                    onClick={() => void loginWithMicrosoft()}
                  >
                    <MicrosoftMark /> {t('Войти через Microsoft')}
                  </Button>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-slate-500">
                {t('Офлайн-аккаунт подходит для одиночной игры и серверов без проверки лицензии. Вход через Microsoft будет добавлен позже.')}
              </p>
            </section>
          </div>
        )}

        <div className="mt-5 flex justify-end border-t border-white/[0.06] pt-5">
          <Button onClick={() => setAccountOpen(false)}>{t("Отмена")}</Button>
        </div>
      </Modal>
    </div>
  )
}
