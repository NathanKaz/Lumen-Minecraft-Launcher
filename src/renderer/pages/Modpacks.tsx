import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, FileArchive, Layers3, Loader2, Package, Search, Upload } from 'lucide-react'
import { api } from '../lib/api'
import { selectedProfile, useLauncher } from '../store'
import { Badge, Button, EmptyState, SectionHeader } from '../components/ui'
import { ProjectDetailPanel } from '../components/ProjectDetailPanel'
import type { ModrinthProject } from '@shared/types'

export function Modpacks({ profileId, embedded = false }: { profileId?: string; embedded?: boolean }): JSX.Element {
  const { state, busy, setBusy, refresh, pushToast } = useLauncher()
  const targetId = profileId ?? selectedProfile(state)?.id
  const target = state?.profiles.find((item) => item.id === targetId)
  const [packs, setPacks] = useState<ModrinthProject[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      void api.searchModpacks(query).then((result) => {
        if (!cancelled) setPacks(result)
      }).catch(() => {
        if (!cancelled) setPacks([])
      }).finally(() => {
        if (!cancelled) setLoading(false)
      })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const install = async (projectId: string, title: string) => {
    if (!targetId) return
    setInstalling(projectId)
    setBusy(true)
    try {
      await api.installModpackFromModrinth(targetId, projectId)
      await refresh()
      pushToast('success', `Модпак «${title}» установлен`)
    } finally {
      setInstalling(null)
      setBusy(false)
    }
  }

  const installLocal = async () => {
    if (!targetId) return
    setBusy(true)
    try {
      await api.installModpack(targetId)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const installedPacks = state?.profiles.filter((item) => item.modpack) ?? []

  return (
    <div className="mx-auto max-w-[1180px]">
      {!embedded && (
        <SectionHeader
          title="Модпаки"
          subtitle="Готовые модпаки из Modrinth или установка из файла .mrpack."
          action={<Button onClick={() => void installLocal()} disabled={busy}><FileArchive size={16} /> Установить .mrpack</Button>}
        />
      )}

      <div
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const file = event.dataTransfer.files[0]
          if (!file || !targetId) return
          setBusy(true)
          void api.installModpackFilePath(targetId, file.path).then(async () => {
            await refresh()
            pushToast('success', 'Модпак добавлен')
          }).finally(() => setBusy(false))
        }}
        className={`panel mb-6 flex items-center gap-5 border-2 border-dashed p-6 transition ${dragging ? 'border-mint-400/60 bg-mint-400/[0.06]' : 'border-white/[0.08]'}`}
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-iris-500/10 text-iris-400">
          <Upload size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white">Перетащите файл модпака сюда</div>
          <p className="mt-1 text-xs text-slate-500">Поддерживаются файлы .mrpack и .zip из Modrinth. Модпак установится в сборку «{target?.name ?? '—'}».</p>
        </div>
        <Button onClick={() => void installLocal()} disabled={busy}>Выбрать файл</Button>
      </div>

      {!embedded && installedPacks.length > 0 && (
        <div className="mb-7">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Установленные модпаки</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {installedPacks.map((item) => (
              <div key={item.id} className="panel flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint-400/10 text-mint-400"><Layers3 size={18} /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{item.modpack?.name}</div>
                  <div className="text-[11px] text-slate-500">v{item.modpack?.version} · MC {item.versionId} · {item.loader}</div>
                </div>
                <Badge tone="mint">Установлен</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Популярные модпаки</h3>
        <div className="relative ml-auto w-full max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input py-2 pl-9 text-xs" placeholder="Поиск модпаков" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>

      {loading && !packs.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="panel shimmer h-52 animate-shimmer" />)}
        </div>
      ) : packs.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packs.map((pack, index) => (
            <motion.div
              key={pack.project_id}
              role="button"
              tabIndex={0}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => setSelectedProjectId(pack.project_id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedProjectId(pack.project_id)
                }
              }}
              className="panel group cursor-pointer overflow-hidden transition hover:border-iris-400/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint-400/40"
            >
              <div className="relative h-24 overflow-hidden bg-gradient-to-br from-iris-600/30 via-ink-800 to-mint-500/20">
                {pack.icon_url && <img src={pack.icon_url} alt="" className="h-full w-full object-cover opacity-80 transition group-hover:scale-105" />}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-800 to-transparent" />
                <div className="absolute bottom-3 left-4"><Badge tone="iris"><Package size={11} /> Модпак</Badge></div>
              </div>
              <div className="p-4">
                <div className="truncate text-sm font-bold text-white">{pack.title}</div>
                <p className="mt-2 line-clamp-2 min-h-[34px] text-[11px] leading-relaxed text-slate-400">{pack.description}</p>
                <div className="mt-3 flex items-center justify-between text-[10px] text-slate-600">
                  <span>{(pack.downloads / 1e6).toFixed(1)}M загрузок</span>
                  <span>{pack.categories.slice(0, 2).join(' · ')}</span>
                </div>
                <Button
                  variant="primary"
                  className="mt-4 w-full"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation()
                    void install(pack.project_id, pack.title)
                  }}
                >
                  {installing === pack.project_id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  {installing === pack.project_id ? 'Установка...' : 'Установить модпак'}
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Package size={22} />} title="Модпаки не найдены" description="Попробуйте изменить запрос." />
      )}

      <ProjectDetailPanel
        projectId={selectedProjectId}
        kind="modpack"
        onClose={() => setSelectedProjectId(null)}
        action={selectedProjectId ? {
          label: target ? `Установить в «${target.name}»` : 'Установить модпак',
          onClick: () => {
            const pack = packs.find((item) => item.project_id === selectedProjectId)
            if (pack) void install(pack.project_id, pack.title)
          },
          disabled: busy || !targetId,
          loading: installing === selectedProjectId
        } : undefined}
      />
    </div>
  )
}
