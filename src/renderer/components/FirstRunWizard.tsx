import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Coffee, Download, UserRound, XCircle } from 'lucide-react'
import { t } from '../lib/i18n'
import { api } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, Button, Modal, ProgressBar, Spinner } from './ui'
import type { JavaInfo, Profile, Settings } from '@shared/types'

type WizardStep = 1 | 2 | 3 | 4

/** Four-step onboarding shown while `settings.onboardingCompleted` is false. */
export function FirstRunWizard({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { state, versions, progress, refresh, pushToast } = useLauncher()
  const [step, setStep] = useState<WizardStep>(1)
  const [language, setLanguage] = useState<'ru' | 'en'>('ru')
  const [playerName, setPlayerName] = useState('')
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
          pushToast('success', t('Профиль игрока создан'))
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
        name: instanceName.trim() || t('Мой Minecraft'),
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

  return (
    <Modal open={open} onClose={() => void finish(false)} title={t('Мастер первого запуска')} width="max-w-xl">
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          {([1, 2, 3, 4] as WizardStep[]).map((value) => (
            <button
              key={value}
              type="button"
              disabled={value >= step || finishing}
              onClick={() => setStep(value)}
              className={`flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] font-bold transition ${
                value === step
                  ? 'border-mint-400/50 bg-mint-400/15 text-mint-300'
                  : value < step
                    ? 'border-mint-400/25 bg-mint-400/[0.06] text-mint-400/70 hover:text-mint-300'
                    : 'border-white/[0.08] bg-white/[0.02] text-slate-600'
              }`}
            >
              {value}
            </button>
          ))}
          <span className="ml-auto font-mono text-[11px] text-slate-600">{step} / 4</span>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-bold text-white">{t('Добро пожаловать в Lumen Launcher')}</h4>
              <p className="mt-1 text-[11px] text-slate-500">{t('Настроим лаунчер за четыре шага')}</p>
            </div>
            <div>
              <label className="label">{t('Язык интерфейса')}</label>
              <div className="grid grid-cols-2 gap-2">
                {([['ru', t('Русский')], ['en', t('English')]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => chooseLanguage(value)}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-semibold transition ${
                      language === value
                        ? 'border-mint-400/50 bg-mint-400/[0.08] text-mint-300'
                        : 'border-white/[0.08] bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200'
                    }`}
                  >
                    {language === value && <CheckCircle2 size={14} />}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <UserRound size={17} className="text-mint-400" />
              <h4 className="text-sm font-bold text-white">{t('Создание аккаунта')}</h4>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              {t('Создайте офлайн-профиль игрока. У него будут свои сборки и скины.')}
            </p>
            {state?.account.type === 'microsoft' ? (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-xs font-semibold text-slate-200">{state.account.name}</div>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  {t('Имя Microsoft-аккаунта берётся из профиля Minecraft и не меняется здесь.')}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="label" htmlFor="wizard-player-name">{t('Имя игрока')}</label>
                  <input
                    id="wizard-player-name"
                    className="input"
                    placeholder="Steve"
                    maxLength={16}
                    value={playerName}
                    autoFocus
                    onChange={(event) => setPlayerName(event.target.value)}
                  />
                </div>
                <p className="text-[10px] leading-relaxed text-slate-500">
                  {t('Это офлайн-аккаунт. Вход через Microsoft будет добавлен позже; имя можно изменить в окне аккаунта.')}
                </p>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Coffee size={17} className="text-mint-400" />
              <h4 className="text-sm font-bold text-white">{t('Проверка Java')}</h4>
            </div>
            {javaLoading ? (
              <div className="flex items-center gap-2 py-6 text-xs text-slate-500">
                <Spinner size={16} /> {t('Проверяем Java...')}
              </div>
            ) : javaError ? (
              <div className="rounded-xl border border-rose-400/20 bg-rose-500/[0.06] p-3 text-[11px] text-rose-300">
                <div className="font-semibold">{t('Не удалось проверить Java')}</div>
                <div className="mt-1 break-words text-rose-200/70">{javaError}</div>
              </div>
            ) : javaInfo ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-200">Java {javaInfo.version}</div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{javaInfo.path}</div>
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
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white">{t('Первая сборка')}</h4>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={createInstance}
                onChange={(event) => setCreateInstance(event.target.checked)}
              />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-slate-200">{t('Создать ванильную сборку')}</span>
                <span className="block text-[10px] text-slate-500">Minecraft {versionId}</span>
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
              <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <Spinner size={14} /> {t('Создание профиля и сборки...')}
                  {progress && <span className="ml-auto font-mono">{Math.round(progress.percent)}%</span>}
                </div>
                {progress && <ProgressBar value={progress.percent} />}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-4">
          <Button disabled={finishing} onClick={() => void finish(false)}>{t('Пропустить')}</Button>
          <div className="flex gap-2">
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
        </div>
      </div>
    </Modal>
  )
}
