import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, CheckCircle2, Coffee, Download, Fingerprint, UserRound, XCircle } from 'lucide-react'
import { t } from '../lib/i18n'
import { api } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, Button, ProgressBar, Spinner } from './ui'
import type { JavaInfo, Profile, Settings } from '@shared/types'
import { defaultProfileName } from '@shared/naming'

type WizardStep = 1 | 2 | 3 | 4

const stepLabels = (): string[] => [
  t('Язык'), t('Игрок'), t('Java'), t('Сборка')
]

/** Full-window onboarding shown while `settings.onboardingCompleted` is false. */
export function FirstRunWizard({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { state, versions, progress, refresh, pushToast } = useLauncher()
  const [step, setStep] = useState<WizardStep>(1)
  const [language, setLanguage] = useState<'ru' | 'en'>('ru')
  const [playerName, setPlayerName] = useState('')
  const [uuidPreview, setUuidPreview] = useState('')
  const [javaInfo, setJavaInfo] = useState<JavaInfo | null>(null)
  const [javaLoading, setJavaLoading] = useState(false)
  const [javaError, setJavaError] = useState<string | null>(null)
  const [installingJava, setInstallingJava] = useState(false)
  const [createInstance, setCreateInstance] = useState(true)
  const [instanceName, setInstanceName] = useState('')
  const [finishing, setFinishing] = useState(false)
  const finishingRef = useRef(false)

  // Reset the flow every time it is opened (including the re-run from Settings).
  useEffect(() => {
    if (!open) return
    setStep(1)
    setLanguage(state?.settings.language ?? 'ru')
    setPlayerName(state?.account.name ?? '')
    setUuidPreview('')
    setJavaInfo(null)
    setJavaError(null)
    setJavaLoading(false)
    setInstallingJava(false)
    setCreateInstance(true)
    setInstanceName('')
    setFinishing(false)
    finishingRef.current = false
  }, [open])

  const patchSettings = useCallback(async (patch: Partial<Settings>): Promise<boolean> => {
    if (!state) return false
    try {
      // The main store shallow-merges settings, so always send the full object.
      await api.setState({ settings: { ...state.settings, ...patch } })
      await refresh()
      return true
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : String(error))
      return false
    }
  }, [state, refresh, pushToast])

  const chooseLanguage = (value: 'ru' | 'en'): void => {
    setLanguage(value)
    void patchSettings({ language: value })
  }

  // The preview uses the same deterministic algorithm as the persisted account.
  useEffect(() => {
    if (!open || step !== 2 || state?.account.type === 'microsoft') {
      setUuidPreview(state?.account.uuid ?? '')
      return
    }
    const name = playerName.trim().slice(0, 16) || 'Steve'
    let cancelled = false
    void api.offlineUuid(name)
      .then((id) => { if (!cancelled) setUuidPreview(id) })
      .catch(() => { if (!cancelled) setUuidPreview('') })
    return () => { cancelled = true }
  }, [open, step, playerName, state?.account.type, state?.account.uuid])

  useEffect(() => {
    if (!open || step !== 3) return
    let cancelled = false
    setJavaLoading(true)
    setJavaError(null)
    void api.detectJava()
      .catch(() => api.getJavaInfo())
      .then((info) => { if (!cancelled) setJavaInfo(info) })
      .catch((error: unknown) => {
        if (!cancelled) setJavaError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => { if (!cancelled) setJavaLoading(false) })
    return () => { cancelled = true }
  }, [open, step])

  const installJava = async (): Promise<void> => {
    setInstallingJava(true)
    setJavaError(null)
    try {
      const info = await api.ensureJava(undefined, undefined, true)
      setJavaInfo(info)
      pushToast('success', t('Java {version} установлена: {path}', { version: info.version, path: info.path }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setJavaError(message)
      pushToast('error', message)
    } finally {
      setInstallingJava(false)
    }
  }

  /** Persist the setup flag on every exit path so the wizard never loops. */
  const finish = useCallback(async (withInstance: boolean): Promise<void> => {
    if (finishingRef.current) return
    finishingRef.current = true
    setFinishing(true)

    // The placeholder offline account from defaultState becomes the player's own profile.
    if (state && state.account.type === 'offline') {
      const cleanName = playerName.trim().slice(0, 16)
      if (cleanName && cleanName !== state.account.name) {
        try {
          await api.setAccount(cleanName)
          const uuid = await api.offlineUuid(cleanName)
          pushToast('success', t('Профиль игрока создан · UUID: {uuid}', { uuid }))
        } catch (error) {
          pushToast('error', error instanceof Error ? error.message : String(error))
        }
      }
    }

    if (withInstance && createInstance && state) {
      const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `wizard-${Date.now()}`
      const profile: Profile = {
        id,
        name: instanceName.trim() || defaultProfileName(versions?.latest.release || '1.20.1', 'vanilla'),
        versionId: versions?.latest.release || '1.20.1',
        loader: 'vanilla',
        createdAt: Date.now(),
        playtimeMinutes: 0
      }
      try {
        await api.createProfile(profile)
        try {
          await api.installProfile(id)
        } catch (error) {
          pushToast('error', error instanceof Error ? error.message : String(error))
        }
        pushToast('success', t('Сборка создана'))
      } catch (error) {
        pushToast('error', error instanceof Error ? error.message : String(error))
      }
    }

    await patchSettings({ onboardingCompleted: true })
    setFinishing(false)
    finishingRef.current = false
    onClose()
  }, [createInstance, instanceName, playerName, state, versions, patchSettings, pushToast, onClose])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        void finish(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, finish])

  const versionId = versions?.latest.release || '1.20.1'
  const labels = stepLabels()

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-x-0 bottom-0 top-11 z-[65] overflow-y-auto bg-ink-950"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label={t('Мастер первого запуска')}
        >
          <div className="pointer-events-none absolute inset-0 grid-overlay opacity-30" />
          <motion.div
            className="relative mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-8 sm:px-10 sm:py-10"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <header className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img src="./logo.png" alt="" className="h-9 w-9 object-contain" />
                <div>
                  <div className="text-sm font-black tracking-[0.18em] text-slate-200">LUMEN LAUNCHER</div>
                  <div className="text-[11px] text-slate-500">{t('Мастер первого запуска')}</div>
                </div>
              </div>
              <Button disabled={finishing} onClick={() => void finish(false)}>{t('Пропустить')}</Button>
            </header>

            <div className="my-auto py-10">
              <div className="mb-8">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-mint-400">
                  {t('Шаг {current} из {total}', { current: step, total: 4 })}
                </div>
                <h1 className="text-2xl font-black text-white sm:text-3xl">{t('Добро пожаловать в Lumen Launcher')}</h1>
                <p className="mt-2 text-sm text-slate-500">{t('Настроим лаунчер за четыре шага')}</p>
              </div>

              <div className="mb-6 grid grid-cols-4 gap-2 sm:gap-3">
                {([1, 2, 3, 4] as WizardStep[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={value >= step || finishing}
                    onClick={() => setStep(value)}
                    className={`flex items-center gap-2 rounded-xl border px-2 py-2.5 text-left transition sm:px-3 ${
                      value === step
                        ? 'border-mint-400/50 bg-mint-400/[0.1] text-mint-300'
                        : value < step
                          ? 'border-mint-400/20 bg-mint-400/[0.04] text-mint-400/80 hover:text-mint-300'
                          : 'border-white/[0.06] bg-white/[0.02] text-slate-600'
                    }`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[11px] font-bold ${
                      value < step ? 'border-mint-400/30 bg-mint-400/10' : 'border-current'
                    }`}>
                      {value < step ? <Check size={13} /> : value}
                    </span>
                    <span className="truncate text-[11px] font-semibold sm:text-xs">{labels[value - 1]}</span>
                  </button>
                ))}
              </div>

              <div className="panel min-h-[320px] p-6 sm:p-8">
                {step === 1 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-lg font-bold text-white">{t('Язык интерфейса')}</h2>
                      <p className="mt-1 text-xs text-slate-500">{t('Выберите язык, на котором будет работать лаунчер.')}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {([['ru', t('Русский')], ['en', t('English')]] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => chooseLanguage(value)}
                          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-5 text-sm font-semibold transition ${
                            language === value
                              ? 'border-mint-400/50 bg-mint-400/[0.08] text-mint-300'
                              : 'border-white/[0.08] bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200'
                          }`}
                        >
                          {label}
                          {language === value && <CheckCircle2 size={18} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-2">
                      <UserRound size={18} className="text-mint-400" />
                      <h2 className="text-lg font-bold text-white">{t('Создание аккаунта')}</h2>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-500">
                      {t('Создайте офлайн-профиль игрока. У него будут свои сборки и скины.')}
                    </p>
                    {state?.account.type === 'microsoft' ? (
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                        <div className="text-sm font-semibold text-slate-200">{state.account.name}</div>
                        <UuidLine uuid={state.account.uuid} />
                        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                          {t('Имя и UUID Microsoft-аккаунта берутся из профиля Minecraft и не меняются здесь.')}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="label" htmlFor="wizard-player-name">{t('Имя игрока')}</label>
                          <input
                            id="wizard-player-name"
                            className="input text-base"
                            placeholder="Steve"
                            maxLength={16}
                            value={playerName}
                            autoFocus
                            onChange={(event) => setPlayerName(event.target.value)}
                          />
                        </div>
                        <div className="rounded-xl border border-mint-400/15 bg-mint-400/[0.04] p-4">
                          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-mint-400">
                            <Fingerprint size={14} /> {t('UUID игрока')}
                          </div>
                          <UuidLine uuid={uuidPreview} />
                          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                            {t('UUID вычисляется из имени игрока и будет виден в окне аккаунта.')}
                          </p>
                        </div>
                        <p className="text-[11px] leading-relaxed text-slate-500">
                          {t('Для лицензированного входа укажите Client ID в настройках и войдите через Microsoft в окне аккаунта.')}
                        </p>
                      </>
                    )}
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-2">
                      <Coffee size={18} className="text-mint-400" />
                      <h2 className="text-lg font-bold text-white">{t('Проверка Java')}</h2>
                    </div>
                    {javaLoading ? (
                      <div className="flex items-center gap-2 py-8 text-xs text-slate-500">
                        <Spinner size={16} /> {t('Проверяем Java...')}
                      </div>
                    ) : javaError ? (
                      <div className="rounded-xl border border-rose-400/20 bg-rose-500/[0.06] p-4 text-xs text-rose-300">
                        <div className="font-semibold">{t('Не удалось проверить Java')}</div>
                        <div className="mt-1 break-words text-rose-200/70">{javaError}</div>
                      </div>
                    ) : javaInfo ? (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-200">Java {javaInfo.version}</div>
                          <div className="mt-1 truncate font-mono text-[11px] text-slate-500">{javaInfo.path}</div>
                        </div>
                        <Badge tone={javaInfo.valid ? 'mint' : 'amber'}>
                          {javaInfo.valid ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                          {javaInfo.valid ? t('Подходит') : t('Проверьте путь')}
                        </Badge>
                      </div>
                    ) : null}
                    {javaInfo && !javaInfo.valid && (
                      <Button variant="primary" disabled={installingJava} onClick={() => void installJava()}>
                        {installingJava ? <Spinner size={14} /> : <Download size={14} />}
                        {installingJava ? t('Установка Java...') : t('Установить подходящую Java')}
                      </Button>
                    )}
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-5">
                    <h2 className="text-lg font-bold text-white">{t('Первая сборка')}</h2>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={createInstance}
                        onChange={(event) => setCreateInstance(event.target.checked)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-200">{t('Создать ванильную сборку')}</span>
                        <span className="mt-1 block text-xs text-slate-500">Minecraft {versionId}</span>
                      </span>
                    </label>
                    {createInstance && (
                      <div>
                        <label className="label">{t('Имя сборки')}</label>
                        <input
                          className="input"
                          placeholder={t('Мой Minecraft')}
                          value={instanceName}
                          onChange={(event) => setInstanceName(event.target.value)}
                        />
                      </div>
                    )}
                    {finishing && (
                      <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Spinner size={14} /> {t('Создание профиля и сборки...')}
                          {progress && <span className="ml-auto font-mono">{Math.round(progress.percent)}%</span>}
                        </div>
                        {progress && <ProgressBar value={progress.percent} />}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-6">
              <Button disabled={finishing} onClick={() => void finish(false)}>{t('Пропустить')}</Button>
              <div className="flex gap-3">
                {step > 1 && (
                  <Button disabled={finishing} onClick={() => setStep((current) => (current - 1) as WizardStep)}>
                    {t('Назад')}
                  </Button>
                )}
                {step < 4 ? (
                  <Button
                    variant="primary"
                    disabled={step === 2 && state?.account.type !== 'microsoft' && !playerName.trim()}
                    onClick={() => setStep((current) => (current + 1) as WizardStep)}
                  >
                    {t('Далее')}
                  </Button>
                ) : (
                  <Button variant="primary" disabled={finishing} onClick={() => void finish(true)}>
                    {finishing && <Spinner size={14} />} {t('Готово')}
                  </Button>
                )}
              </div>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function UuidLine({ uuid }: { uuid: string }): JSX.Element {
  return (
    <div className="mt-2 select-all break-all font-mono text-xs text-mint-300" title={uuid}>
      {uuid || '—'}
    </div>
  )
}
