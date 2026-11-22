import { useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import {
  CheckCircle2, Clock, Coffee, Download, ExternalLink, FileDown, FileUp, FolderOpen, Github,
  HelpCircle, Info, KeyRound, Keyboard, Palette, RefreshCw, Search, Terminal, Upload, XCircle
} from 'lucide-react'
import {
  DEFAULT_HOTKEYS, HOTKEY_DEFINITIONS, comboFromEvent, formatShortcut, hotkeysFromSettings
} from '@shared/hotkeys'
import { api, isMock } from '../lib/api'
import { APP_LICENSE, APP_REPOSITORY, APP_VERSION } from '@shared/version'
import { useLauncher } from '../store'
import { Badge, Button, ProgressBar, SectionHeader, Select, Spinner, Toggle } from '../components/ui'
import { Tooltip } from '../components/Tooltip'
import type { JavaInfo, LauncherInfo, ScheduledBackupSettings, UpdateDownload, UpdateInfo } from '@shared/types'

const AZURE_PORTAL = 'https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade'
const CURSEFORGE_CONSOLE = 'https://console.curseforge.com/?#/api-keys'
const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}

/** Click, press a combination, and it replaces the shortcut (Escape cancels). */
function HotkeyCapture({
  value, onChange, onCancel
}: { value: string; onChange: (combo: string) => void; onCancel: () => void }): JSX.Element {
  const [capturing, setCapturing] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setCapturing(true)}
      onBlur={() => setCapturing(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          setCapturing(false)
          onCancel()
          return
        }
        const combo = comboFromEvent(event)
        if (!combo) return
        event.preventDefault()
        setCapturing(false)
        onChange(combo)
      }}
      className={`min-w-[104px] shrink-0 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] font-semibold outline-none transition ${
        capturing
          ? 'border-mint-400/70 bg-mint-400/10 text-mint-300 ring-2 ring-mint-400/15'
          : 'border-white/10 bg-ink-900 text-slate-300 hover:border-mint-400/40 hover:text-mint-300'
      }`}
      title={t('Нажмите, чтобы изменить сочетание')}
    >
      {capturing ? t('Нажмите сочетание...') : formatShortcut(value, isMac())}
    </button>
  )
}

export function Settings(): JSX.Element {
  const { state, refresh, pushToast, progress } = useLauncher()
  const [java, setJava] = useState<JavaInfo | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [downloaded, setDownloaded] = useState<UpdateDownload | null>(null)
  const [launcherInfo, setLauncherInfo] = useState<LauncherInfo | null>(null)
  const [settingsQuery, setSettingsQuery] = useState('')

  useEffect(() => {
    void api.getJavaInfo().then(setJava).catch(() => setJava(null))
    void api.getLauncherInfo().then(setLauncherInfo).catch(() => setLauncherInfo(null))
  }, [])

  if (!state) return <Spinner />
  const settings = state.settings
  const scheduled: ScheduledBackupSettings = settings.scheduledBackup ?? { enabled: false, intervalHours: 6, keepCount: 10 }

  // Search aliases are not user-visible, so English terms stay literal here.
  const normalizedSettingsQuery = settingsQuery.trim().toLowerCase()
  const matchesSection = (title: string, keywords: string): boolean =>
    !normalizedSettingsQuery || `${title} ${keywords}`.toLowerCase().includes(normalizedSettingsQuery)
  const showJava = matchesSection('Java', `${t('Путь к Java')} ${t('Автоматически устанавливать Java')} java jvm джава путь path auto`)
  const showPerformance = matchesSection(
    t('Производительность'),
    `${t('Память')} ${t('Ширина окна')} ${t('Высота окна')} ${t('Полноэкранный режим')} memory ram память разрешение fullscreen resolution width height`
  )
  const showFolders = matchesSection(
    t('Каталоги'),
    `${t('Данные лаунчера')} ${t('Сборки и миры')} ${t('Моды активной сборки')} ${t('Журналы')} folders папки каталоги путь paths files`
  )
  const showGeneral = matchesSection(
    t('Общее'),
    `${t('Проверять обновления')} ${t('Язык интерфейса')} ${t('Повторить мастер первого запуска')} ${t('Client ID приложения Azure')} ${t('Ключ API CurseForge')} general language обновления язык setup wizard microsoft msa client id azure curseforge world worlds key`
  )
  const showBackups = matchesSection(
    t('Бэкапы по расписанию'),
    `${t('Создавать копии автоматически')} ${t('Интервал, часы')} ${t('Хранить копий')} backup backups бэкап копии расписание interval`
  )
  const showHotkeys = matchesSection(
    t('Горячие клавиши'),
    `${t('Сочетания клавиш')} ${t('Сбросить по умолчанию')} hotkeys shortcuts keyboard key combo клавиши сочетания сброс`
  )
  const showAppearance = matchesSection(
    t('Тема и доступность'),
    `${t('Тема')} ${t('Акцентный цвет')} ${t('Масштаб интерфейса')} ${t('Компактный режим')} ${t('Уменьшить анимацию')} theme light dark accent color accessibility scale zoom compact motion доступность светлая тёмная`
  )
  const showTransfer = matchesSection(
    t('Перенос настроек'),
    `${t('Экспорт настроек')} ${t('Импорт настроек')} export import json settings файл настройки перенос`
  )
  const showAbout = matchesSection(
    t('О лаунчере'),
    `${t('Версия')} ${t('Лицензия')} ${t('Автор')} GitHub ${t('Каталог данных')} about version license author github ссылка repository`
  )
  const anySectionVisible = showJava || showPerformance || showFolders || showGeneral ||
    showBackups || showHotkeys || showAppearance || showTransfer || showAbout

  const update = async (patch: Partial<typeof settings>) => {
    await api.setState({ settings: { ...settings, ...patch } })
    await refresh()
  }

  const hotkeys = hotkeysFromSettings(settings)
  const setHotkey = (action: keyof typeof hotkeys, combo: string) => {
    const next = { ...hotkeys }
    const conflict = (Object.keys(next) as Array<keyof typeof next>).find((key) => key !== action && next[key] === combo)
    if (conflict) next[conflict] = hotkeys[action]
    next[action] = combo
    void update({ hotkeys: next })
  }
  const resetHotkeys = () => void update({ hotkeys: { ...DEFAULT_HOTKEYS } })

  const transfer = async (direction: 'export' | 'import') => {
    try {
      if (direction === 'export') {
        await api.exportSettings()
        pushToast('success', t('Настройки экспортированы'))
      } else {
        await api.importSettings()
        await refresh()
        pushToast('success', t('Настройки импортированы'))
      }
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : String(error))
    }
  }

  const updateScheduled = (patch: Partial<ScheduledBackupSettings>) => {
    void update({ scheduledBackup: { ...scheduled, ...patch } })
  }

  const clampSetting = (value: string, min: number, max: number): number => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : min
  }

  const detect = async () => {
    setDetecting(true)
    try {
      const result = await api.detectJava()
      setJava(result)
      await refresh()
      pushToast(result.valid ? 'success' : 'error', result.valid ? t('Java {version} найдена', { version: result.version }) : t("Java не найдена"))
    } finally {
      setDetecting(false)
    }
  }

  const checkForUpdates = async () => {
    setCheckingUpdates(true)
    try {
      const info = await api.checkUpdates()
      setUpdateInfo(info)
      if (!info.updateAvailable) setDownloaded(null)
      pushToast(info.updateAvailable ? 'info' : 'success', info.updateAvailable
        ? t('Доступна новая версия лаунчера: {version}', { version: info.latestVersion })
        : t('Обновлений не найдено'))
    } finally {
      setCheckingUpdates(false)
    }
  }

  const download = async () => {
    try {
      const result = await api.downloadUpdate()
      setDownloaded(result)
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : String(error))
    }
  }

  const install = async () => {
    if (!downloaded) return
    try {
      await api.installUpdate(downloaded)
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : String(error))
    }
  }

  const downloading = progress?.phase === 'update' && progress.percent < 100

  return (
    <div className="mx-auto max-w-[1060px]">
      <SectionHeader title={t("Настройки")} subtitle={t("Пути, память и Java.")} />

      <div className="relative mb-5">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
        <input
          className="input pl-9"
          placeholder={t('Поиск по настройкам')}
          value={settingsQuery}
          onChange={(event) => setSettingsQuery(event.target.value)}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {showJava && (
        <div className="panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Coffee size={18} className="text-mint-400" />
            <h3 className="text-sm font-bold text-white">Java</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="label flex items-center gap-1.5">
                {t("Путь к Java")}
                <Tooltip content={t('Путь к исполняемому файлу Java. Оставьте пустым, чтобы лаунчер использовал автоопределённую совместимую Java.')}>
                  <HelpCircle size={13} className="text-slate-600" />
                </Tooltip>
              </label>
              <div className="flex gap-2">
                <input
                  className="input font-mono text-xs"
                  placeholder={t("Автоопределение")}
                  value={settings.javaPath}
                  onChange={(event) => void update({ javaPath: event.target.value })}
                />
                <Button onClick={() => void detect()} disabled={detecting}>
                  {detecting ? <Spinner size={14} /> : <RefreshCw size={15} />}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center gap-2">
                {java?.valid ? <CheckCircle2 size={16} className="text-mint-400" /> : <XCircle size={16} className="text-rose-400" />}
                <div>
                  <div className="text-xs font-semibold text-slate-200">Java {java?.version ?? '—'}</div>
                  <div className="truncate font-mono text-[10px] text-slate-500">{java?.path || t("не найдена")}</div>
                </div>
              </div>
              <Badge tone={java?.valid ? 'mint' : 'amber'}>{java?.valid ? t("Подходит") : t("Проверьте путь")}</Badge>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              {t("Для Minecraft 1.18+ нужна Java 17, для 1.20.5+ — Java 21. Лаунчер подберёт установленную версию автоматически.")}
            </p>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div>
                <div className="text-xs font-semibold text-slate-200">{t("Автоматически устанавливать Java")}</div>
                <div className="text-[10px] text-slate-500">{t("Если подходящая Java не найдена, лаунчер скачает JRE.")}</div>
              </div>
              <Toggle
                checked={settings.autoInstallJava !== false}
                onChange={() => void update({ autoInstallJava: settings.autoInstallJava === false })}
              />
            </div>
          </div>
        </div>
        )}

        {showPerformance && (
        <div className="panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Terminal size={18} className="text-iris-400" />
            <h3 className="text-sm font-bold text-white">{t("Производительность")}</h3>
          </div>
          <div className="space-y-5">
            <div>
              <label className="label flex items-center gap-1.5">
                {t('Память по умолчанию: {memory} МБ', { memory: settings.memory })}
                <Tooltip content={t('Объём памяти в мегабайтах для игр без собственного значения. Безопасное значение — 2048–4096 МБ.')}>
                  <HelpCircle size={13} className="text-slate-600" />
                </Tooltip>
              </label>
              <input
                type="range"
                min={1024}
                max={16384}
                step={512}
                value={settings.memory}
                style={{ '--range-value': `${((settings.memory - 1024) / 15360) * 100}%` } as React.CSSProperties}
                onChange={(event) => void update({ memory: Number(event.target.value) })}
                className="w-full"
              />
              <div className="mt-2 flex justify-between text-[10px] text-slate-600"><span>{t("1 ГБ")}</span><span>{t("16 ГБ")}</span></div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                {t('Используется всеми сборками, у которых нет своего значения. Свою память можно задать в настройках сборки{extra}.', {
                  extra: state.profiles.some((profile) => profile.memory !== undefined)
                    ? t(' (таких сборок: {count})', { count: state.profiles.filter((profile) => profile.memory !== undefined).length })
                    : ''
                })}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label flex items-center gap-1.5">
                  {t("Ширина окна")}
                  <Tooltip content={t('Размер окна в пикселях. Безопасное значение — 1280×720; в полноэкранном режиме размер игнорируется.')}>
                    <HelpCircle size={13} className="text-slate-600" />
                  </Tooltip>
                </label>
                <input type="number" className="input" value={settings.width} onChange={(event) => void update({ width: Number(event.target.value) })} />
              </div>
              <div>
                <label className="label">{t("Высота окна")}</label>
                <input type="number" className="input" value={settings.height} onChange={(event) => void update({ height: Number(event.target.value) })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  {t("Полноэкранный режим")}
                  <Tooltip content={t('Включите, чтобы игра запускалась на весь экран. Безопасное значение — выключено, размер окна задаётся выше.')}>
                    <HelpCircle size={13} className="text-slate-600" />
                  </Tooltip>
                </div>
                <div className="text-[10px] text-slate-500">{t("Игра запускается в полноэкранном режиме")}</div>
              </div>
              <Toggle checked={settings.fullscreen} onChange={() => void update({ fullscreen: !settings.fullscreen })} />
            </div>
          </div>
        </div>
        )}

        {showFolders && (
        <div className="panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <FolderOpen size={18} className="text-amber-400" />
            <h3 className="text-sm font-bold text-white">{t("Каталоги")}</h3>
          </div>
          <div className="grid gap-2">
            {([
              ['root', t("Данные лаунчера")],
              ['instances', t("Сборки и миры")],
              ['mods', t("Моды активной сборки")],
              ['logs', t("Журналы")]
            ] as const).map(([kind, label]) => (
              <button
                key={kind}
                onClick={() => void api.openFolder(kind)}
                className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left text-xs font-semibold text-slate-300 transition hover:border-mint-400/25 hover:text-mint-300"
              >
                {label} <FolderOpen size={15} />
              </button>
            ))}
          </div>
        </div>
        )}

        {showGeneral && (
        <div className="panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Terminal size={18} className="text-slate-400" />
            <h3 className="text-sm font-bold text-white">{t("Общее")}</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div>
                <div className="text-xs font-semibold text-slate-200">{t("Проверять обновления")}</div>
                <div className="text-[10px] text-slate-500">{t("При запуске лаунчера")}</div>
              </div>
              <Toggle checked={settings.checkUpdates} onChange={() => void update({ checkUpdates: !settings.checkUpdates })} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div>
                <div className="text-xs font-semibold text-slate-200">{t("Автоматические бэкапы перед обновлениями")}</div>
                <div className="text-[10px] text-slate-500">{t("Перед обновлением модов и версий создаётся бэкап миров.")}</div>
              </div>
              <Toggle
                checked={settings.autoBackupBeforeUpdates !== false}
                onChange={() => void update({ autoBackupBeforeUpdates: settings.autoBackupBeforeUpdates === false })}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div>
                <div className="text-xs font-semibold text-slate-200">{t("Язык интерфейса")}</div>
                <div className="text-[10px] text-slate-500">{t("Русский и английский")}</div>
              </div>
              <Select
                className="w-28"
                value={settings.language}
                onChange={(language) => void update({ language: language as 'ru' | 'en' })}
                options={[
                  { value: 'ru', label: t("Русский") },
                  { value: 'en', label: 'English' }
                ]}
              />
            </div>
            <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <label className="label flex items-center gap-1.5" htmlFor="msa-client-id">
                <KeyRound size={13} className="text-mint-400" />
                {t('Client ID приложения Azure')}
                <Tooltip content={t('Собственный Client ID приложения Azure используется для лицензированного входа в Minecraft. Оставьте поле пустым, чтобы скрыть кнопку Microsoft.')}>
                  <HelpCircle size={13} className="text-slate-600" />
                </Tooltip>
              </label>
              <input
                id="msa-client-id"
                className="input font-mono text-xs"
                placeholder="00000000-0000-0000-0000-000000000000"
                spellCheck={false}
                value={settings.msaClientId ?? ''}
                onChange={(event) => void update({ msaClientId: event.target.value.trim() })}
              />
              <p className="text-[10px] leading-relaxed text-slate-500">
                {t('Нужен для входа через Microsoft. Создайте приложение в Azure и добавьте Redirect URI http://localhost.')}{' '}
                <button
                  type="button"
                  onClick={() => void api.openExternal(AZURE_PORTAL)}
                  className="inline-flex items-center gap-1 font-semibold text-mint-400 hover:text-mint-300"
                >
                  Azure Portal <ExternalLink size={10} />
                </button>
              </p>
              {settings.msaClientId && !CLIENT_ID_PATTERN.test(settings.msaClientId) && (
                <p className="text-[10px] text-amber-300">{t('Client ID обычно выглядит как UUID — проверьте значение.')}</p>
              )}
            </div>
            <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <label className="label flex items-center gap-1.5" htmlFor="curseforge-api-key">
                <KeyRound size={13} className="text-mint-400" />
                {t('Ключ API CurseForge')}
                <Tooltip content={t('Нужен для каталога готовых миров CurseForge. Получите ключ в консоли разработчика CurseForge.')}>
                  <HelpCircle size={13} className="text-slate-600" />
                </Tooltip>
              </label>
              <input
                id="curseforge-api-key"
                type="password"
                className="input font-mono text-xs"
                placeholder={t('Ключ не задан')}
                spellCheck={false}
                autoComplete="off"
                value={settings.curseforgeApiKey ?? ''}
                onChange={(event) => void update({ curseforgeApiKey: event.target.value.trim() })}
              />
              <p className="text-[10px] leading-relaxed text-slate-500">
                {t('Нужен для каталога готовых миров CurseForge. Получите ключ в консоли разработчика CurseForge.')}{' '}
                <button
                  type="button"
                  onClick={() => void api.openExternal(CURSEFORGE_CONSOLE)}
                  className="inline-flex items-center gap-1 font-semibold text-mint-400 hover:text-mint-300"
                >
                  CurseForge <ExternalLink size={10} />
                </button>
              </p>
            </div>
            <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-200">{t('Обновления лаунчера')}</div>
                  <div className="text-[10px] text-slate-500">
                    {updateInfo
                      ? updateInfo.updateAvailable
                        ? t('Версия {current} · доступна {latest}', { current: updateInfo.currentVersion, latest: updateInfo.latestVersion })
                        : t('Версия {current} · обновлений нет', { current: updateInfo.currentVersion })
                      : t('Версия лаунчера: {version}', { version: APP_VERSION })}
                  </div>
                  {downloaded && (
                    <div className="mt-1 truncate font-mono text-[10px] text-mint-300" title={downloaded.fileName}>
                      {t('Загружено: {file}', { file: downloaded.fileName })}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Button title={t('Проверить')} onClick={() => void checkForUpdates()} disabled={checkingUpdates}>
                    {checkingUpdates ? <Spinner size={14} /> : <RefreshCw size={14} />}
                  </Button>
                  {updateInfo?.updateAvailable && !downloaded && (
                    <Button
                      variant="primary"
                      onClick={() => void download()}
                      disabled={downloading || !updateInfo.asset}
                      title={updateInfo.asset ? t('Скачать обновление') : t('Для этой платформы нет доступного обновления.')}
                    >
                      {downloading ? <Spinner size={14} /> : <Download size={14} />} {t('Скачать')}
                    </Button>
                  )}
                  {downloaded && (
                    <Button variant="primary" onClick={() => void install()}>
                      <Download size={14} /> {downloaded.method === 'manual' ? t('Открыть') : t('Установить')}
                    </Button>
                  )}
                  {updateInfo && (
                    <Button
                      title={t('Открыть страницу релиза')}
                      onClick={() => void api.openExternal(updateInfo.url)}
                    >
                      <ExternalLink size={14} />
                    </Button>
                  )}
                </div>
              </div>
              {downloading && progress && (
                <div className="space-y-1.5">
                  <ProgressBar value={progress.percent} />
                  <div className="text-right font-mono text-[10px] text-slate-500">{Math.round(progress.percent)}%</div>
                </div>
              )}
              {updateInfo?.releaseNotes && (
                <details className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2">
                  <summary className="cursor-pointer text-[10px] font-semibold text-slate-400">{t('Заметки о релизе')}</summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-sans text-[10px] leading-relaxed text-slate-500">
                    {updateInfo.releaseNotes}
                  </pre>
                </details>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div>
                <div className="text-xs font-semibold text-slate-200">{t('Повторить мастер первого запуска')}</div>
                <div className="text-[10px] text-slate-500">{t('Настройки будут сброшены только для флага мастера')}</div>
              </div>
              <Button className="shrink-0" onClick={() => void update({ onboardingCompleted: false })}>
                <RefreshCw size={14} /> {t('Повторить мастер первого запуска')}
              </Button>
            </div>
            {isMock && <Badge tone="iris">{t("Демо-режим: файлы не изменяются")}</Badge>}
          </div>
        </div>
        )}

        {showBackups && (
        <div className="panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Clock size={18} className="text-amber-400" />
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-white">
              {t('Бэкапы по расписанию')}
              <Tooltip content={t('Автоматические копии миров с заданным интервалом. Безопасные значения: интервал 6 часов и не более 10 последних копий.')}>
                <HelpCircle size={14} className="text-slate-600" />
              </Tooltip>
            </h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div>
                <div className="text-xs font-semibold text-slate-200">{t('Создавать копии автоматически')}</div>
                <div className="text-[10px] text-slate-500">{t('Бэкапы миров всех сборок через заданный интервал.')}</div>
              </div>
              <Toggle
                checked={scheduled.enabled}
                onChange={() => updateScheduled({ enabled: !scheduled.enabled })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t('Интервал, часы')}</label>
                <input
                  type="number"
                  min={1}
                  max={720}
                  className="input"
                  value={scheduled.intervalHours}
                  onChange={(event) => updateScheduled({ intervalHours: clampSetting(event.target.value, 1, 720) })}
                />
              </div>
              <div>
                <label className="label">{t('Хранить копий')}</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="input"
                  value={scheduled.keepCount}
                  onChange={(event) => updateScheduled({ keepCount: clampSetting(event.target.value, 1, 100) })}
                />
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              {t('Старые копии удаляются автоматически. Во время игры бэкапы пропускаются.')}
            </p>
          </div>
        </div>
        )}

        {showHotkeys && (
          <div className="panel p-5">
            <div className="mb-4 flex items-center gap-2">
              <Keyboard size={18} className="text-mint-400" />
              <h3 className="text-sm font-bold text-white">{t('Горячие клавиши')}</h3>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
              {t('Сочетания работают в лаунчере. Нажмите на клавишу, затем новое сочетание; Escape отменяет.')}
            </p>
            <div className="space-y-1.5">
              {HOTKEY_DEFINITIONS.map((definition) => (
                <div key={definition.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-slate-200">{t(definition.label)}</div>
                    <div className="truncate text-[10px] text-slate-500">{t(definition.hint)}</div>
                  </div>
                  <HotkeyCapture
                    value={hotkeys[definition.id]}
                    onChange={(combo) => setHotkey(definition.id, combo)}
                    onCancel={() => {}}
                  />
                </div>
              ))}
            </div>
            <Button className="mt-3 w-full justify-center" onClick={resetHotkeys}>
              <RefreshCw size={14} /> {t('Сбросить по умолчанию')}
            </Button>
          </div>
        )}

        {showAppearance && (
          <div className="panel p-5">
            <div className="mb-4 flex items-center gap-2">
              <Palette size={18} className="text-iris-400" />
              <h3 className="text-sm font-bold text-white">{t('Тема и доступность')}</h3>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('Тема')}</label>
                  <Select
                    value={settings.theme ?? 'dark'}
                    onChange={(theme) => void update({ theme: theme as 'dark' | 'light' })}
                    options={[
                      { value: 'dark', label: t('Тёмная') },
                      { value: 'light', label: t('Светлая') }
                    ]}
                  />
                </div>
                <div>
                  <label className="label">{t('Акцентный цвет')}</label>
                  <Select
                    value={settings.accent ?? 'mint'}
                    onChange={(accent) => void update({ accent: accent as 'mint' | 'violet' | 'sky' | 'amber' | 'rose' })}
                    options={[
                      { value: 'mint', label: t('Мятный') },
                      { value: 'violet', label: t('Фиолетовый') },
                      { value: 'sky', label: t('Небесный') },
                      { value: 'amber', label: t('Янтарный') },
                      { value: 'rose', label: t('Розовый') }
                    ]}
                  />
                </div>
              </div>
              <div>
                <label className="label">{t('Масштаб интерфейса: {scale}%', { scale: Math.round((settings.accessibility?.uiScale ?? 1) * 100) })}</label>
                <input
                  type="range"
                  min={0.8}
                  max={1.3}
                  step={0.05}
                  value={settings.accessibility?.uiScale ?? 1}
                  onChange={(event) => void update({
                    accessibility: {
                      uiScale: Number(event.target.value),
                      compact: settings.accessibility?.compact ?? false,
                      reducedMotion: settings.accessibility?.reducedMotion ?? false
                    }
                  })}
                  className="w-full"
                />
                <div className="mt-1 flex justify-between text-[10px] text-slate-600"><span>80%</span><span>130%</span></div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div>
                  <div className="text-xs font-semibold text-slate-200">{t('Компактный режим')}</div>
                  <div className="text-[10px] text-slate-500">{t('Меньше отступов и плотнее карточки')}</div>
                </div>
                <Toggle
                  checked={settings.accessibility?.compact ?? false}
                  onChange={() => void update({
                    accessibility: {
                      uiScale: settings.accessibility?.uiScale ?? 1,
                      compact: !settings.accessibility?.compact,
                      reducedMotion: settings.accessibility?.reducedMotion ?? false
                    }
                  })}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div>
                  <div className="text-xs font-semibold text-slate-200">{t('Уменьшить анимацию')}</div>
                  <div className="text-[10px] text-slate-500">{t('Убирает движение и переходы интерфейса')}</div>
                </div>
                <Toggle
                  checked={settings.accessibility?.reducedMotion ?? false}
                  onChange={() => void update({
                    accessibility: {
                      uiScale: settings.accessibility?.uiScale ?? 1,
                      compact: settings.accessibility?.compact ?? false,
                      reducedMotion: !settings.accessibility?.reducedMotion
                    }
                  })}
                />
              </div>
            </div>
          </div>
        )}

        {showTransfer && (
          <div className="panel p-5">
            <div className="mb-4 flex items-center gap-2">
              <Upload size={18} className="text-amber-400" />
              <h3 className="text-sm font-bold text-white">{t('Перенос настроек')}</h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={() => void transfer('export')} className="justify-center">
                <FileDown size={15} /> {t('Экспорт настроек')}
              </Button>
              <Button onClick={() => void transfer('import')} className="justify-center">
                <FileUp size={15} /> {t('Импорт настроек')}
              </Button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              {t('Файл содержит пути, память, тему и Hotkeys. Ключи API и токены не экспортируются и остаются на этом компьютере.')}
            </p>
          </div>
        )}

        {showAbout && (
          <div className="panel p-5">
            <div className="mb-4 flex items-center gap-2">
              <Info size={18} className="text-iris-400" />
              <h3 className="text-sm font-bold text-white">{t('О лаунчере')}</h3>
            </div>
            <div className="space-y-2">
              {([
                [t('Название'), launcherInfo?.name ?? 'Lumen Launcher'],
                [t('Версия'), launcherInfo?.version ?? APP_VERSION],
                [t('Лицензия'), launcherInfo?.license ?? APP_LICENSE],
                [t('Автор'), launcherInfo?.author ?? 'NathanKaz'],
                [t('Платформа'), launcherInfo ? `${launcherInfo.platform} · ${launcherInfo.arch}` : '—'],
                [t('Технологии'), launcherInfo
                  ? `Electron ${launcherInfo.electron} · Chromium ${launcherInfo.chrome} · Node ${launcherInfo.node}`
                  : '—'],
                [t('Каталог данных'), launcherInfo?.dataDir ?? '—']
              ] as const).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 border-b border-white/[0.04] pb-2 text-[11px] last:border-0">
                  <span className="shrink-0 text-slate-500">{label}</span>
                  <span className="break-all text-right font-mono text-slate-300">{value}</span>
                </div>
              ))}
            </div>
            <Button
              className="mt-4 w-full justify-center"
              onClick={() => void api.openExternal(launcherInfo?.repository ?? APP_REPOSITORY)}
            >
              <Github size={15} /> GitHub <ExternalLink size={12} />
            </Button>
            <p className="mt-2 break-all text-center font-mono text-[9px] text-slate-600">
              {launcherInfo?.repository ?? APP_REPOSITORY}
            </p>
          </div>
        )}

        {!anySectionVisible && (
          <div className="panel p-8 text-center text-sm text-slate-500">{t('Ничего не найдено')}</div>
        )}
      </div>

    </div>
  )
}
