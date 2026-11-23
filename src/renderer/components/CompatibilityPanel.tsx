import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react'
import { t } from '../lib/i18n'
import { api } from '../lib/api'
import { Button, Spinner } from './ui'
import type { CompatibilityReport } from '@shared/types'

/** Read-only compatibility diagnostics shared by the instance tools and shader tab. */
export function CompatibilityPanel({ profileId }: { profileId: string }): JSX.Element {
  const [report, setReport] = useState<CompatibilityReport | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setReport(null) }, [profileId])

  const run = async () => {
    setBusy(true)
    try {
      setReport(await api.checkCompatibility(profileId))
    } catch {
      setReport(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck size={17} className="text-mint-400" /> {t('Проверка совместимости')}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {t('Проверяет моды, загрузчик шейдеров, Java и объём памяти для этой сборки.')}
          </p>
        </div>
        <Button onClick={() => void run()} disabled={busy}>
          {busy ? <Spinner size={14} /> : report ? <RefreshCw size={14} /> : <ShieldCheck size={14} />}
          {t('Проверить совместимость')}
        </Button>
      </div>

      {report && (
        <div className={`rounded-xl border p-3 text-xs ${
          report.ok
            ? 'border-mint-400/30 bg-mint-400/[0.06] text-mint-300'
            : 'border-amber-400/30 bg-amber-400/[0.06] text-amber-300'
        }`}>
          <div className="flex items-center gap-2 font-semibold">
            {report.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {report.summary}
          </div>
          {report.issues.length > 0 && (
            <ul className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-2">
              {report.issues.map((issue) => (
                <li
                  key={issue.id}
                  className={`flex items-start gap-2 text-[11px] leading-relaxed ${
                    issue.severity === 'error' ? 'text-rose-300' : 'text-amber-200/90'
                  }`}
                >
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span className="break-words">{issue.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
