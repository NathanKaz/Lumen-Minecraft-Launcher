import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Layers3, Puzzle } from 'lucide-react'
import { t } from '../lib/i18n'
import { api } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, EmptyState, Modal, Select, Spinner } from './ui'
import type { ModInfo, Profile } from '@shared/types'

function modKey(mod: ModInfo): string {
  return (mod.projectId ?? mod.name ?? mod.fileName).trim().toLowerCase()
}

function ModRows({ mods, empty }: { mods: ModInfo[]; empty: string }): JSX.Element {
  if (!mods.length) return <p className="py-2 text-[11px] text-slate-500">{empty}</p>
  return (
    <div className="space-y-1">
      {mods.map((mod) => (
        <div key={mod.fileName} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-slate-200">{mod.name}</div>
            <div className="truncate font-mono text-[10px] text-slate-500">{mod.fileName}</div>
          </div>
          <Badge tone="slate">{mod.version || '—'}</Badge>
        </div>
      ))}
    </div>
  )
}

/** Side-by-side mod list diff for two instances. */
export function InstanceCompare({
  open, onClose, initialIds = []
}: { open: boolean; onClose: () => void; initialIds?: [string, string] | string[] }): JSX.Element {
  const { state } = useLauncher()
  const profiles = state?.profiles ?? []
  const [leftId, setLeftId] = useState(initialIds[0] ?? '')
  const [rightId, setRightId] = useState(initialIds[1] ?? '')
  const [leftMods, setLeftMods] = useState<ModInfo[]>([])
  const [rightMods, setRightMods] = useState<ModInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (!leftId && profiles[0]) setLeftId(profiles[0].id)
    if (!rightId && profiles[1]) setRightId(profiles[1]?.id ?? profiles[0].id)
  }, [open, profiles, leftId, rightId])

  useEffect(() => {
    if (!open || !leftId || !rightId) return
    let cancelled = false
    setLoading(true)
    setError('')
    void Promise.all([api.listMods(leftId), api.listMods(rightId)])
      .then(([left, right]) => {
        if (cancelled) return
        setLeftMods(left)
        setRightMods(right)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, leftId, rightId])

  const diff = useMemo(() => {
    const leftMap = new Map(leftMods.map((mod) => [modKey(mod), mod]))
    const rightMap = new Map(rightMods.map((mod) => [modKey(mod), mod]))
    return {
      onlyLeft: leftMods.filter((mod) => !rightMap.has(modKey(mod))),
      onlyRight: rightMods.filter((mod) => !leftMap.has(modKey(mod))),
      shared: leftMods.filter((mod) => rightMap.has(modKey(mod)))
    }
  }, [leftMods, rightMods])

  const options = profiles.map((profile: Profile) => ({ value: profile.id, label: profile.name }))

  return (
    <Modal open={open} onClose={onClose} title={t('Сравнение сборок')} width="max-w-3xl">
      <p className="mb-4 text-[11px] text-slate-500">{t('Сравнение двух сборок по модам')}</p>
      <div className="mb-5 grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div>
          <label className="label">{t('Сборка A')}</label>
          <Select value={leftId} onChange={setLeftId} options={options} />
        </div>
        <ArrowRight size={16} className="mx-auto mb-3 hidden text-slate-600 sm:block" />
        <div>
          <label className="label">{t('Сборка B')}</label>
          <Select value={rightId} onChange={setRightId} options={options} />
        </div>
      </div>

      {loading && <div className="py-8 text-center"><Spinner /></div>}
      {!loading && error && (
        <div className="mb-4 rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-xs text-rose-300">{error}</div>
      )}
      {!loading && !error && (!leftId || !rightId) && (
        <EmptyState icon={<Layers3 size={22} />} title={t('Выберите сборку')} description={t('Две сборки нужны для сравнения')} />
      )}
      {!loading && !error && leftId && rightId && (
        <div className="grid gap-4 sm:grid-cols-3">
          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-amber-300">
              <Puzzle size={14} /> {t('Только в сборке A')}
              <Badge tone="amber">{diff.onlyLeft.length}</Badge>
            </div>
            <ModRows mods={diff.onlyLeft} empty={t('Отличий нет')} />
          </section>
          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-iris-400">
              <Puzzle size={14} /> {t('Только в сборке B')}
              <Badge tone="iris">{diff.onlyRight.length}</Badge>
            </div>
            <ModRows mods={diff.onlyRight} empty={t('Отличий нет')} />
          </section>
          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-mint-300">
              <Puzzle size={14} /> {t('Общие моды')}
              <Badge tone="mint">{diff.shared.length}</Badge>
            </div>
            <ModRows mods={diff.shared} empty={t('Отличий нет')} />
          </section>
        </div>
      )}
      {!loading && leftId && rightId && (
        <p className="mt-4 text-[10px] text-slate-500">
          {t('Всего модов')}: {leftMods.length} / {rightMods.length}
        </p>
      )}
    </Modal>
  )
}
