import { useEffect, useState, type MouseEvent } from 'react'
import { Archive, CircleArrowUp, Clock3, Globe2, Package } from 'lucide-react'
import { getLocale, t } from '../lib/i18n'
import { api } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, Spinner } from './ui'
import type { Profile } from '@shared/types'

interface Signals {
  mods: number
  updates: number
  worlds: number
}

const EMPTY_SIGNALS: Signals = { mods: 0, updates: 0, worlds: 0 }
const cache = new Map<string, { revision: unknown; signals: Signals }>()

function lastPlayedLabel(value?: number): string {
  if (!value) return t('Ещё не запускали')
  return new Date(value).toLocaleDateString(getLocale() === 'ru' ? 'ru-RU' : 'en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
}

export function InstanceSignals({ profile }: { profile: Profile }): JSX.Element {
  const { state, refresh, pushToast, setBusy } = useLauncher()
  const [signals, setSignals] = useState<Signals>(EMPTY_SIGNALS)
  const [creating, setCreating] = useState(false)
  // A new profiles array means `refresh()` ran; re-read the lightweight signals then.
  // Caching by that reference avoids repeated IPC calls on unrelated re-renders.
  const profilesRevision = state?.profiles

  useEffect(() => {
    let cancelled = false
    const cached = cache.get(profile.id)
    if (cached && cached.revision === profilesRevision) {
      setSignals(cached.signals)
      return
    }
    void Promise.all([
      api.listMods(profile.id).catch(() => []),
      api.checkModUpdates(profile.id).catch(() => []),
      api.listWorlds(profile.id).catch(() => [])
    ]).then(([mods, updates, worlds]) => {
      const next: Signals = { mods: mods.length, updates: updates.length, worlds: worlds.length }
      cache.set(profile.id, { revision: profilesRevision, signals: next })
      if (!cancelled) setSignals(next)
    })
    return () => { cancelled = true }
  }, [profile.id, profilesRevision])

  const createBackup = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setCreating(true)
    setBusy(true)
    try {
      await api.createBackup(profile.id)
      await refresh()
      pushToast('success', t('Резервная копия создана'))
    } catch (reason) {
      pushToast('error', reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
      setCreating(false)
    }
  }

  const scheduled = state?.settings.scheduledBackup

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone="slate"><Package size={11} /> {signals.mods} {t('модов')}</Badge>
      {signals.updates > 0 && (
        <Badge tone="amber"><CircleArrowUp size={11} /> {signals.updates} {t('обновлений')}</Badge>
      )}
      <Badge tone="iris"><Globe2 size={11} /> {signals.worlds} {t('миров')}</Badge>
      <Badge tone="slate">
        <Clock3 size={11} /> {t('Последний запуск')}: {lastPlayedLabel(profile.lastPlayed)}
      </Badge>
      <span title={t('Резервные копии по расписанию')} className="inline-flex">
        <Badge tone={scheduled?.enabled ? 'mint' : 'slate'}>
          <Archive size={11} />
          {scheduled?.enabled ? `${scheduled.intervalHours} ${t('ч')}` : t('выключены')}
        </Badge>
      </span>
      <button
        type="button"
        draggable={false}
        disabled={creating}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => void createBackup(event)}
        title={t('Создать бэкап')}
        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-300 transition hover:border-mint-400/30 hover:text-mint-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {creating ? <Spinner size={11} /> : <Archive size={11} />}
        {t('Создать бэкап')}
      </button>
    </div>
  )
}
