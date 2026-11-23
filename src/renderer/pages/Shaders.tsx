import { useEffect, useState } from 'react'
import { Layers, Search, Sparkles, Trash2, Upload } from 'lucide-react'
import { formatSize, t } from '../lib/i18n'
import { api } from '../lib/api'
import { findProfile, selectedProfile, useLauncher } from '../store'
import { CatalogPanel } from '../components/CatalogPanel'
import { Badge, Button, EmptyState, SectionHeader, Select, Spinner, Toggle } from '../components/ui'
import type { PackInfo } from '@shared/types'

/** Standalone Modrinth shader browser with management of installed shader packs. */
export function Shaders(): JSX.Element {
  const { state, setPage } = useLauncher()
  const [profileId, setProfileId] = useState<string | null>(null)
  const [view, setView] = useState<'catalog' | 'installed'>('catalog')
  const [packs, setPacks] = useState<PackInfo[]>([])
  const [loadingPacks, setLoadingPacks] = useState(false)
  const [busy, setBusy] = useState(false)

  const defaultProfile = selectedProfile(state)
  const activeId = profileId && state?.profiles.some((profile) => profile.id === profileId)
    ? profileId
    : defaultProfile?.id ?? ''
  const profile = findProfile(state, activeId)

  const load = async () => {
    if (!activeId) return
    setLoadingPacks(true)
    try {
      setPacks(await api.listPacks(activeId, 'shader'))
    } catch {
      setPacks([])
    } finally {
      setLoadingPacks(false)
    }
  }

  useEffect(() => { void load() }, [activeId, view])

  const toggle = async (pack: PackInfo, enabled: boolean) => {
    setPacks((current) => current.map((entry) =>
      entry.fileName === pack.fileName ? { ...entry, enabled } : entry
    ))
    try {
      await api.togglePack(activeId, 'shader', pack.fileName, enabled)
    } catch {
      await load()
    }
  }

  const remove = async (pack: PackInfo) => {
    setBusy(true)
    try {
      await api.deletePack(activeId, 'shader', pack.fileName)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const addLocal = async () => {
    setBusy(true)
    try {
      await api.installPack(activeId, 'shader')
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <SectionHeader
        title={t('Каталог шейдеров')}
        subtitle={t('Подберите шейдеры в Modrinth и установите их в выбранную сборку.')}
      />

      {!profile ? (
        <EmptyState
          icon={<Sparkles size={22} />}
          title={t('Нет сборки')}
          description={t('Создайте сборку, чтобы устанавливать шейдеры.')}
          action={<Button variant="primary" onClick={() => setPage('library')}>{t('Открыть библиотеку')}</Button>}
        />
      ) : (
        <>
          <div className="panel mb-5 flex flex-wrap items-center gap-3 p-4">
            <label className="label mb-0 flex items-center gap-1.5">
              <Sparkles size={14} className="text-mint-400" /> {t('Сборка')}
            </label>
            <Select
              className="w-64"
              value={activeId}
              onChange={setProfileId}
              options={(state?.profiles ?? []).map((entry) => ({
                value: entry.id,
                label: `${entry.name} · ${entry.versionId}`
              }))}
            />
            <span className="text-[11px] text-slate-500">{t('Файлы попадают в папку shaderpacks сборки.')}</span>
            <span className="w-full text-[11px] text-amber-300/80">
              {t('Для работы шейдеров нужна совместимая модификация: Iris, Oculus или OptiFine.')}
            </span>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
              <button
                onClick={() => setView('catalog')}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                  view === 'catalog' ? 'bg-mint-400/10 text-mint-300' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Search size={14} /> {t('Каталог')}
              </button>
              <button
                onClick={() => setView('installed')}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                  view === 'installed' ? 'bg-mint-400/10 text-mint-300' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Layers size={14} /> {t('Установленные')}
                {packs.length > 0 && <span className="rounded-full bg-white/[0.06] px-1.5 text-[10px]">{packs.length}</span>}
              </button>
            </div>
            {view === 'installed' && (
              <Button onClick={() => void addLocal()} disabled={busy}>
                {busy ? <Spinner size={14} /> : <Upload size={15} />} {t('Добавить')}
              </Button>
            )}
          </div>

          {view === 'catalog' ? (
            <div className="panel p-5">
              <CatalogPanel key={profile.id} kind="shader" profileId={profile.id} />
            </div>
          ) : loadingPacks ? (
            <div className="flex items-center justify-center py-8"><Spinner size={20} /></div>
          ) : packs.length ? (
            <div className="space-y-2">
              {packs.map((pack) => (
                <div key={pack.fileName} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Layers size={17} className={pack.enabled ? 'text-mint-400' : 'text-slate-600'} />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-100">{pack.name}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">{formatSize(pack.size)} · <span className="font-mono">{pack.fileName}</span></div>
                    </div>
                    {pack.enabled && <Badge tone="mint">{t('Включён')}</Badge>}
                  </div>
                  <div className="flex items-center gap-3">
                    <Toggle checked={pack.enabled} onChange={() => void toggle(pack, !pack.enabled)} />
                    <Button onClick={() => void remove(pack)} disabled={busy}><Trash2 size={14} /></Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-slate-500">
              {t('Наборов шейдеров пока нет.')}
            </div>
          )}
        </>
      )}
    </div>
  )
}
