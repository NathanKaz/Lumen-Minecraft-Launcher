import { useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import { CheckCircle2, Clock, Coffee, Download, FolderOpen, HelpCircle, RefreshCw, Search, Terminal, XCircle } from 'lucide-react'
import { api, isMock } from '../lib/api'
import { APP_VERSION } from '@shared/version'
import { useLauncher } from '../store'
import { Badge, Button, SectionHeader, Select, Spinner, Toggle } from '../components/ui'
import { Tooltip } from '../components/Tooltip'
import type { JavaInfo, ScheduledBackupSettings, UpdateInfo } from '@shared/types'

export function Settings(): JSX.Element {
  const { state, refresh, pushToast } = useLauncher()
  const [java, setJava] = useState<JavaInfo | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [settingsQuery, setSettingsQuery] = useState('')

  useEffect(() => {
    void api.getJavaInfo().then(setJava).catch(() => setJava(null))
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
    `${t('Проверять обновления')} ${t('Язык интерфейса')} ${t('Повторить мастер первого запуска')} ${t('Client ID приложения Azure')} general language обновления язык setup wizard microsoft msa client id azure`
  )
  const showBackups = matchesSection(
    t('Бэкапы по расписанию'),
    `${t('Создавать копии автоматически')} ${t('Интервал, часы')} ${t('Хранить копий')} backup backups бэкап копии расписание interval`
  )
  const anySectionVisible = showJava || showPerformance || showFolders || showGeneral || showBackups

  const update = async (patch: Partial<typeof settings>) => {
    await api.setState({ settings: { ...settings, ...patch } })
    await refresh()
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
      pushToast(info.updateAvailable ? 'info' : 'success', info.updateAvailable
        ? t('Доступна новая версия лаунчера: {version}', { version: info.latestVersion })
        : t('Обновлений не найдено'))
    } finally {
      setCheckingUpdates(false)
    }
  }

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
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div>
                <div className="text-xs font-semibold text-slate-200">{t('Обновления лаунчера')}</div>
                <div className="text-[10px] text-slate-500">
                  {updateInfo
                    ? updateInfo.updateAvailable
                      ? t('Версия {current} · доступна {latest}', { current: updateInfo.currentVersion, latest: updateInfo.latestVersion })
                      : t('Версия {current} · обновлений нет', { current: updateInfo.currentVersion })
                    : t('Версия лаунчера: {version}', { version: APP_VERSION })}
                </div>
              </div>
              <Button onClick={() => void checkForUpdates()} disabled={checkingUpdates}>
                {checkingUpdates ? <Spinner size={14} /> : <Download size={15} />} {t('Проверить')}
              </Button>
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

        {!anySectionVisible && (
          <div className="panel p-8 text-center text-sm text-slate-500">{t('Ничего не найдено')}</div>
        )}
      </div>

    </div>
  )
}
