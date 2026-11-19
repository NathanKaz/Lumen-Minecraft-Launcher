import { useEffect, useState } from 'react'
import { getLocale, t } from '../lib/i18n'
import { CheckCircle2, Coffee, Copy, Download, FolderOpen, RefreshCw, Terminal, Trash2, XCircle } from 'lucide-react'
import { api, isMock } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, Button, SectionHeader, Select, Spinner, Toggle } from '../components/ui'
import type { JavaInfo, UpdateInfo } from '@shared/types'

export function Settings(): JSX.Element {
  const { state, logs, refresh, pushToast } = useLauncher()
  const [java, setJava] = useState<JavaInfo | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [checkingUpdates, setCheckingUpdates] = useState(false)

  useEffect(() => {
    void api.getJavaInfo().then(setJava).catch(() => setJava(null))
  }, [])

  if (!state) return <Spinner />
  const settings = state.settings

  const update = async (patch: Partial<typeof settings>) => {
    await api.setState({ settings: { ...settings, ...patch } })
    await refresh()
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
        : t('У вас последняя версия лаунчера'))
    } finally {
      setCheckingUpdates(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1060px]">
      <SectionHeader title={t("Настройки")} subtitle={t("Пути, память, Java и журналы лаунчера.")} />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Coffee size={18} className="text-mint-400" />
            <h3 className="text-sm font-bold text-white">Java</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="label">{t("Путь к Java")}</label>
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

        <div className="panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Terminal size={18} className="text-iris-400" />
            <h3 className="text-sm font-bold text-white">{t("Производительность")}</h3>
          </div>
          <div className="space-y-5">
            <div>
              <label className="label">{t('Память по умолчанию: {memory} МБ', { memory: settings.memory })}</label>
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
                <label className="label">{t("Ширина окна")}</label>
                <input type="number" className="input" value={settings.width} onChange={(event) => void update({ width: Number(event.target.value) })} />
              </div>
              <div>
                <label className="label">{t("Высота окна")}</label>
                <input type="number" className="input" value={settings.height} onChange={(event) => void update({ height: Number(event.target.value) })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div>
                <div className="text-xs font-semibold text-slate-200">{t("Полноэкранный режим")}</div>
                <div className="text-[10px] text-slate-500">{t("Игра запускается в полноэкранном режиме")}</div>
              </div>
              <Toggle checked={settings.fullscreen} onChange={() => void update({ fullscreen: !settings.fullscreen })} />
            </div>
          </div>
        </div>

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
                    ? t('Текущая версия: {current} · последняя: {latest}', { current: updateInfo.currentVersion, latest: updateInfo.latestVersion })
                    : t('Проверьте, доступна ли новая версия')}
                </div>
              </div>
              <Button onClick={() => void checkForUpdates()} disabled={checkingUpdates}>
                {checkingUpdates ? <Spinner size={14} /> : <Download size={15} />} {t('Проверить')}
              </Button>
            </div>
            {isMock && <Badge tone="iris">{t("Демо-режим: файлы не изменяются")}</Badge>}
          </div>
        </div>
      </div>

      <div className="panel mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2">
            <Terminal size={17} className="text-mint-400" />
            <h3 className="text-sm font-bold text-white">{t("Журнал лаунчера")}</h3>
            <Badge>{logs.length}</Badge>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void navigator.clipboard.writeText(logs.map((log) => log.message).join('\n')).then(() => pushToast('success', t("Логи скопированы")))}>
              <Copy size={14} /> {t("Копировать")}
            </Button>
            <Button onClick={() => void api.clearLogs().then(refresh)}><Trash2 size={14} /> {t("Очистить")}</Button>
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto bg-ink-950/60 p-4 font-mono text-[11px] leading-relaxed">
          {logs.map((log, index) => (
            <div key={`${log.time}-${index}`} className="flex gap-3">
              <span className="shrink-0 text-slate-700">{new Date(log.time).toLocaleTimeString(getLocale() === 'ru' ? 'ru-RU' : 'en-US')}</span>
              <span className={log.level === 'error' ? 'text-rose-400' : log.level === 'warn' ? 'text-amber-400' : log.level === 'game' ? 'text-slate-400' : 'text-mint-400'}>
                {log.message}
              </span>
            </div>
          ))}
          {!logs.length && <div className="py-10 text-center text-slate-700">{t("Журнал пуст")}</div>}
        </div>
      </div>
    </div>
  )
}
