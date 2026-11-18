import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Camera, Download, FolderOpen, Image as ImageIcon, Trash2, X } from 'lucide-react'
import { api } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, Button, EmptyState, Modal, SectionHeader, Select } from '../components/ui'
import type { ScreenshotInfo } from '@shared/types'

function formatSize(bytes: number): string {
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} МБ`
  return `${Math.max(1, Math.round(bytes / 1000))} КБ`
}

function formatDate(value: number): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export function Screenshots(): JSX.Element {
  const { state, pushToast } = useLauncher()
  const [filter, setFilter] = useState('all')
  const [shots, setShots] = useState<ScreenshotInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ScreenshotInfo | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const result = await api.listScreenshots(filter === 'all' ? undefined : filter)
      setShots(result)
    } catch {
      setShots([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [filter])

  const remove = async (shot: ScreenshotInfo) => {
    await api.deleteScreenshot(shot.profileId, shot.fileName)
    if (selected?.profileId === shot.profileId && selected.fileName === shot.fileName) setSelected(null)
    await load()
    pushToast('info', 'Скриншот удалён')
  }

  const filterOptions = [
    { value: 'all', label: 'Все сборки' },
    ...(state?.profiles ?? []).map((profile) => ({ value: profile.id, label: profile.name }))
  ]

  return (
    <div className="mx-auto max-w-[1180px]">
      <SectionHeader
        title="Скриншоты"
        subtitle="Снимки из папки screenshots каждой сборки. Фильтруйте по сборке и открывайте лучшие моменты."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filter} onChange={setFilter} options={filterOptions} className="w-52" />
            <Button onClick={() => void api.openFolder('screenshots')}>
              <FolderOpen size={15} /> Папка
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="panel shimmer h-56 animate-shimmer" />
          ))}
        </div>
      ) : shots.length ? (
        <>
          <div className="mb-4 flex items-center justify-between text-[11px] text-slate-600">
            <span>{shots.length} снимков</span>
            <span>Нажмите на снимок, чтобы открыть его</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shots.map((shot, index) => (
              <motion.button
                key={`${shot.profileId}/${shot.fileName}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index, 12) * 0.02 }}
                onClick={() => setSelected(shot)}
                className="panel group overflow-hidden p-0 text-left transition hover:border-mint-400/30"
              >
                <div className="relative aspect-video overflow-hidden bg-ink-950">
                  <img src={shot.dataUrl} alt={shot.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8">
                    <div className="truncate text-xs font-semibold text-white">{shot.name}</div>
                    <div className="text-[10px] text-slate-300">{formatDate(shot.createdAt)}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Camera size={13} className="shrink-0 text-slate-600" />
                    <span className="truncate text-[11px] text-slate-400">{shot.profileName}</span>
                  </div>
                  <Badge>{formatSize(shot.size)}</Badge>
                </div>
              </motion.button>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<ImageIcon size={22} />}
          title="Скриншотов нет"
          description="Сделайте снимок в игре (клавиша F2) — он появится здесь автоматически."
          action={<Button onClick={() => void api.openFolder('screenshots')}><FolderOpen size={15} /> Открыть папку сборки</Button>}
        />
      )}

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.name ?? ''} width="max-w-4xl">
        {selected && (
          <div className="space-y-4">
            <img src={selected.dataUrl} alt={selected.name} className="w-full rounded-xl border border-white/[0.06] object-contain" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <Badge tone="mint">{selected.profileName}</Badge>
                <span>{formatDate(selected.createdAt)}</span>
                <span>· {formatSize(selected.size)}</span>
              </div>
              <div className="flex gap-2">
                <a
                  href={selected.dataUrl}
                  download={selected.fileName}
                  className="btn-ghost inline-flex items-center gap-2"
                >
                  <Download size={15} /> Скачать
                </a>
                <Button variant="danger" onClick={() => void remove(selected)}>
                  <Trash2 size={15} /> Удалить
                </Button>
                <Button onClick={() => setSelected(null)}><X size={15} /> Закрыть</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
