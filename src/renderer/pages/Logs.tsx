import { useEffect, useState } from 'react'
import { getLocale, t } from '../lib/i18n'
import { Copy, Search, Terminal, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, Button, SectionHeader, Select, Spinner } from '../components/ui'
import type { CrashReportInfo, LogFileInfo, LogPayload } from '@shared/types'

type LogSource = 'memory' | 'files'
type LevelFilter = 'all' | LogPayload['level']
type ActiveEntry = { kind: 'log' | 'crash'; name: string } | null

const LEVELS: LogPayload['level'][] = ['info', 'warn', 'error', 'game']

/** Raw game logs have no structured level, so infer one for the filter and colors. */
function lineLevel(line: string): LogPayload['level'] {
  const upper = line.toUpperCase()
  if (/\b(ERROR|FATAL)\b/.test(upper)) return 'error'
  if (/\bWARN(ING)?\b/.test(upper)) return 'warn'
  if (/\[INFO\]/.test(upper)) return 'info'
  return 'game'
}

function visibleLines(
  text: string,
  query: string,
  level: LevelFilter,
  useLevel: boolean
): Array<{ text: string; level: LogPayload['level'] }> {
  const needle = query.trim().toLowerCase()
  return text.split(/\r?\n/).filter(Boolean).map((line) => ({ text: line, level: lineLevel(line) }))
    .filter((line) =>
      (!needle || line.text.toLowerCase().includes(needle)) &&
      (!useLevel || level === 'all' || line.level === level)
    )
}

function levelClass(level: LogPayload['level']): string {
  return level === 'error' ? 'text-rose-400' : level === 'warn' ? 'text-amber-400' : level === 'game' ? 'text-slate-400' : 'text-mint-400'
}

export function Logs(): JSX.Element {
  const { state, logs, refresh, pushToast } = useLauncher()
  const [logSource, setLogSource] = useState<LogSource>('memory')
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all')
  const [logQuery, setLogQuery] = useState('')
  const [logProfile, setLogProfile] = useState<string | null>(null)
  const [logFiles, setLogFiles] = useState<LogFileInfo[]>([])
  const [crashReports, setCrashReports] = useState<CrashReportInfo[]>([])
  const [activeEntry, setActiveEntry] = useState<ActiveEntry>(null)
  const [fileText, setFileText] = useState('')
  const [fileLoading, setFileLoading] = useState(false)

  const fileProfileId = logProfile ?? state?.selectedProfileId ?? ''

  useEffect(() => {
    if (logSource !== 'files') return
    let cancelled = false
    void Promise.all([
      api.getLogFiles(fileProfileId || undefined),
      api.listCrashReports(fileProfileId || undefined)
    ]).then(([files, reports]) => {
      if (cancelled) return
      setLogFiles(files)
      setCrashReports(reports)
      setActiveEntry((current) => {
        if (current?.kind === 'log' && files.some((file) => file.name === current.name)) return current
        if (current?.kind === 'crash' && reports.some((report) => report.name === current.name)) return current
        if (files[0]) return { kind: 'log', name: files[0].name }
        if (reports[0]) return { kind: 'crash', name: reports[0].name }
        return null
      })
    }).catch(() => {
      if (cancelled) return
      setLogFiles([])
      setCrashReports([])
      setActiveEntry(null)
    })
    return () => { cancelled = true }
  }, [logSource, fileProfileId])

  useEffect(() => {
    if (logSource !== 'files' || activeEntry?.kind !== 'log') return
    let cancelled = false
    setFileLoading(true)
    void api.readLogFile(fileProfileId || undefined, activeEntry.name)
      .then((content) => { if (!cancelled) setFileText(content.text) })
      .catch(() => { if (!cancelled) setFileText('') })
      .finally(() => { if (!cancelled) setFileLoading(false) })
    return () => { cancelled = true }
  }, [logSource, fileProfileId, activeEntry?.kind, activeEntry?.name])

  if (!state) return <Spinner />

  const needle = logQuery.trim().toLowerCase()
  const visibleLogs = logs.filter((log) =>
    (levelFilter === 'all' || log.level === levelFilter) && (!needle || log.message.toLowerCase().includes(needle))
  )
  const activeReport = activeEntry?.kind === 'crash'
    ? crashReports.find((report) => report.name === activeEntry.name)
    : undefined
  const activeLines = activeEntry?.kind === 'crash'
    ? visibleLines(activeReport?.text ?? '', needle, 'all', false)
    : activeEntry?.kind === 'log'
      ? visibleLines(fileText, needle, levelFilter, true)
      : []
  const copyText = logSource === 'memory'
    ? visibleLogs.map((log) => log.message).join('\n')
    : activeLines.map((line) => line.text).join('\n')

  return (
    <div className="mx-auto max-w-[1300px]">
      <SectionHeader title={t("Логи")} subtitle={t("Журналы лаунчера и отчёты о сбоях.")} />

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2">
            <Terminal size={17} className="text-mint-400" />
            <h3 className="text-sm font-bold text-white">{t("Журнал лаунчера")}</h3>
            <Badge>{logSource === 'memory' ? visibleLogs.length : activeLines.length}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-white/[0.08] bg-ink-900/80 p-0.5">
              {([['memory', t('В памяти')], ['files', t('Файлы и отчёты')]] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setLogSource(value)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                    logSource === value ? 'bg-mint-400/15 text-mint-300' : 'text-slate-500 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                className="input w-48 pl-8 text-xs"
                placeholder={t('Поиск по журналу')}
                value={logQuery}
                onChange={(event) => setLogQuery(event.target.value)}
              />
            </div>
            <Select
              className="w-28"
              value={levelFilter}
              onChange={(value) => setLevelFilter(value as LevelFilter)}
              options={[
                { value: 'all', label: t('Все уровни') },
                ...LEVELS.map((level) => ({ value: level, label: level.toUpperCase() }))
              ]}
            />
            <Button onClick={() => void navigator.clipboard.writeText(copyText).then(() => pushToast('success', t('Логи скопированы')))}>
              <Copy size={14} /> {t("Копировать")}
            </Button>
            {logSource === 'memory' && (
              <Button onClick={() => void api.clearLogs().then(refresh)}><Trash2 size={14} /> {t("Очистить")}</Button>
            )}
          </div>
        </div>
        {logSource === 'memory' ? (
          <div className="max-h-[calc(100vh-260px)] overflow-y-auto bg-ink-950/60 p-4 font-mono text-[11px] leading-relaxed">
            {visibleLogs.map((log, index) => (
              <div key={`${log.time}-${index}`} className="flex gap-3">
                <span className="shrink-0 text-slate-700">{new Date(log.time).toLocaleTimeString(getLocale() === 'ru' ? 'ru-RU' : 'en-US')}</span>
                <span className={levelClass(log.level)}>{log.message}</span>
              </div>
            ))}
            {!visibleLogs.length && <div className="py-10 text-center text-slate-700">{t("Журнал пуст")}</div>}
          </div>
        ) : (
          <div className="grid bg-ink-950/60 lg:grid-cols-[260px_1fr]">
            <div className="space-y-3 border-b border-white/[0.06] p-4 lg:border-b-0 lg:border-r">
              <div>
                <label className="label">{t('Сборка')}</label>
                <Select
                  value={fileProfileId}
                  onChange={(value) => { setLogProfile(value); setActiveEntry(null); setFileText('') }}
                  options={[
                    { value: '', label: t('Лаунчер (общие журналы)') },
                    ...state.profiles.map((profile) => ({ value: profile.id, label: profile.name }))
                  ]}
                />
              </div>
              <div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">{t('Файлы журналов')}</div>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {logFiles.map((file) => (
                    <button
                      key={file.name}
                      onClick={() => setActiveEntry({ kind: 'log', name: file.name })}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] transition ${
                        activeEntry?.kind === 'log' && activeEntry.name === file.name
                          ? 'bg-mint-400/10 text-mint-300'
                          : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                      }`}
                    >
                      <span className="truncate font-mono">{file.name}</span>
                      <span className="shrink-0 text-[10px] text-slate-600">
                        {new Date(file.modifiedAt).toLocaleTimeString(getLocale() === 'ru' ? 'ru-RU' : 'en-US')}
                      </span>
                    </button>
                  ))}
                  {!logFiles.length && <div className="px-2 py-2 text-[11px] text-slate-700">{t('Файлы журналов не найдены')}</div>}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">{t('Отчёты о сбоях')}</div>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {crashReports.map((report) => (
                    <button
                      key={report.name}
                      onClick={() => setActiveEntry({ kind: 'crash', name: report.name })}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] transition ${
                        activeEntry?.kind === 'crash' && activeEntry.name === report.name
                          ? 'bg-rose-400/10 text-rose-300'
                          : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                      }`}
                    >
                      <span className="truncate font-mono">{report.name}</span>
                      <span className="shrink-0 text-[10px] text-slate-600">
                        {new Date(report.modifiedAt).toLocaleTimeString(getLocale() === 'ru' ? 'ru-RU' : 'en-US')}
                      </span>
                    </button>
                  ))}
                  {!crashReports.length && <div className="px-2 py-2 text-[11px] text-slate-700">{t('Отчёты о сбоях не найдены')}</div>}
                </div>
              </div>
            </div>
            <div className="max-h-[calc(100vh-260px)] overflow-y-auto p-4 font-mono text-[11px] leading-relaxed">
              {fileLoading && <div className="flex items-center justify-center gap-2 py-10 text-slate-700"><Spinner size={14} /> {t('Загрузка...')}</div>}
              {!fileLoading && !activeEntry && <div className="py-10 text-center text-slate-700">{t('Выберите файл')}</div>}
              {!fileLoading && activeEntry && !activeLines.length && <div className="py-10 text-center text-slate-700">{t('Ничего не найдено')}</div>}
              {!fileLoading && activeLines.map((line, index) => (
                <div key={index} className="flex gap-3">
                  <span className="shrink-0 text-slate-700">{String(index + 1).padStart(3, '0')}</span>
                  <span className={levelClass(line.level)}>{line.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
