import { useEffect, useState } from 'react'
import {
  Blocks, ChevronRight, Coffee, FileText, FileWarning, FolderOpen, MemoryStick,
  Settings, ShieldCheck
} from 'lucide-react'
import { t } from '../lib/i18n'
import { api } from '../lib/api'
import { useLauncher } from '../store'
import { Button, Modal, Spinner } from './ui'
import type { CrashAction, CrashAnalysis } from '@shared/types'

function actionIcon(action: CrashAction): JSX.Element {
  switch (action) {
    case 'increaseMemory': return <MemoryStick size={16} />
    case 'installJava': return <Coffee size={16} />
    case 'openMods': return <Blocks size={16} />
    case 'verifyFiles': return <ShieldCheck size={16} />
    case 'openReport': return <FileText size={16} />
    case 'openSettings': return <Settings size={16} />
  }
}

export function CrashAssistant({ profileId, onClose }: { profileId: string; onClose: () => void }): JSX.Element {
  const { state, setPage, openProfile, refresh, pushToast, setBusy, busy } = useLauncher()
  const [analysis, setAnalysis] = useState<CrashAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)

  useEffect(() => {
    let cancelled = false
    setAnalysis(null)
    setError(null)
    setShowReport(false)
    setLoading(true)
    api.analyzeCrash(profileId).then((result) => {
      if (!cancelled) setAnalysis(result)
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [profileId])

  const profile = state?.profiles.find((item) => item.id === profileId) ?? null

  const runAction = async (action: CrashAction) => {
    if (action === 'openReport') {
      setShowReport(true)
      return
    }
    if (action === 'increaseMemory' || action === 'openSettings') {
      setPage('settings')
      onClose()
      return
    }
    setBusy(true)
    try {
      if (action === 'installJava') {
        const info = await api.ensureJava(undefined, profileId, true)
        pushToast('success', t('Java {version} установлена: {path}', { version: info.major, path: info.path }))
      } else if (action === 'verifyFiles') {
        const report = await api.verifyProfile(profileId, true)
        await refresh()
        pushToast(report.ok ? 'success' : 'error', report.ok
          ? t('Файлы в порядке')
          : t('Найдено проблем: {count}', { count: report.missing.length + report.invalid.length }))
      } else if (action === 'openMods') {
        await openProfile(profileId)
      }
      onClose()
    } catch (reason) {
      pushToast('error', reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const openLogs = async () => {
    setBusy(true)
    try {
      await api.openFolder('logs')
    } catch (reason) {
      pushToast('error', reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={t('Помощник при вылете игры')} width="max-w-2xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-bold text-white">{profile?.name ?? t('Сборка не найдена')}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {profile ? `Minecraft ${profile.versionId} · ${profile.loader.toUpperCase()}` : t('Сборка не найдена')}
            </div>
          </div>
          {analysis && <span className="text-[11px] text-slate-500">{t('Отчёты о сбоях')}</span>}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500">
            <Spinner size={16} /> {t('Анализируем отчёт...')}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-400/25 bg-rose-500/[0.06] p-4 text-xs text-rose-300">
            <div className="font-semibold">{t('Не удалось проанализировать сбой')}</div>
            <div className="mt-1 break-words text-[11px] text-rose-200/70">{error}</div>
          </div>
        ) : analysis ? (
          <>
            <div className="flex gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
              <FileWarning size={18} className="mt-0.5 shrink-0 text-amber-300" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-amber-200">{t('Причина')}</div>
                <p className="mt-1 text-xs leading-relaxed text-amber-100/80">{analysis.summary}</p>
              </div>
            </div>

            {analysis.details.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-bold text-slate-300">{t('Подробности')}</div>
                <pre className="max-h-40 overflow-auto rounded-xl border border-white/[0.07] bg-ink-900/80 p-3 font-mono text-[11px] leading-relaxed text-slate-400">
                  {analysis.details.slice(0, 6).join('\n')}
                </pre>
              </div>
            )}

            {analysis.suggestions.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-bold text-slate-300">{t('Что можно сделать')}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {analysis.suggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      disabled={busy}
                      onClick={() => void runAction(suggestion.action)}
                      className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-left transition hover:border-mint-400/30 hover:bg-mint-400/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mint-400/10 text-mint-300">
                        {actionIcon(suggestion.action)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-slate-100">{suggestion.title || suggestion.action}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{suggestion.description}</span>
                      </span>
                      <ChevronRight size={14} className="mt-1 shrink-0 text-slate-600" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showReport && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-300">
                  <FileText size={14} /> {analysis.reportName || t('Открыть полный отчёт')}
                </div>
                <pre className="max-h-60 overflow-auto rounded-xl border border-white/[0.07] bg-ink-900/80 p-3 font-mono text-[11px] leading-relaxed text-slate-400">
                  {analysis.reportText ?? t('Файл не найден')}
                </pre>
              </div>
            )}
          </>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-4">
          <Button onClick={() => void openLogs()} disabled={busy}>
            <FolderOpen size={14} /> {t('Открыть папку логов')}
          </Button>
          <Button variant="primary" onClick={onClose}>{t('Закрыть')}</Button>
        </div>
      </div>
    </Modal>
  )
}
