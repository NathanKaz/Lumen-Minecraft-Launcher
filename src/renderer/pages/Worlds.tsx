import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Archive, Copy, Download, FolderOpen, Globe2, Pencil, Search, Trash2, Upload, X
} from 'lucide-react'
import { formatSize, t } from '../lib/i18n'
import { api } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, Button, EmptyState, Spinner } from '../components/ui'
import { CatalogPanel } from '../components/CatalogPanel'
import type { WorldInfo } from '@shared/types'

/** Hybrid worlds tab: local saves manager plus a Modrinth map/datapack catalog. */
export function Worlds({ profileId }: { profileId: string }): JSX.Element {
  const { state, busy, setBusy, pushToast } = useLauncher()
  const target = state?.profiles.find((item) => item.id === profileId)
  const [section, setSection] = useState<'local' | 'catalog'>('local')
  const [catalogKind, setCatalogKind] = useState<'adventure' | 'datapack'>('adventure')
  const [worlds, setWorlds] = useState<WorldInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [busyWorld, setBusyWorld] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [copyTarget, setCopyTarget] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setWorlds(await api.listWorlds(profileId))
    } catch {
      setWorlds([])
    } finally {
      setLoading(false)
    }
  }, [profileId])

  useEffect(() => { void load() }, [load])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
      await load()
    } finally {
      setBusy(false)
    }
  }

  const importWorld = () => void run(async () => {
    await api.importWorldFile(profileId)
    pushToast('success', t('Мир добавлен в сборку'))
  })

  const filtered = worlds.filter((world) => `${world.name} ${world.version}`.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
          {([
            { id: 'local', label: t('Мои миры'), icon: Globe2 },
            { id: 'catalog', label: t('Каталог'), icon: Search }
          ] as const).map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`relative flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${section === item.id ? 'text-mint-300' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {section === item.id && <motion.span layoutId="worlds-section" className="absolute inset-0 rounded-lg bg-mint-400/10" />}
              <item.icon size={14} className="relative z-10" />
              <span className="relative z-10">{item.label}</span>
            </button>
          ))}
        </div>
        {section === 'local' && (
          <>
            <span className="text-[10px] text-slate-600">
              {t('Миры сборки «{name}» · папка saves', { name: target?.name ?? '—' })}
            </span>
            <div className="relative ml-auto w-full max-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input py-2 pl-9 text-xs"
                placeholder={t('Поиск миров')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Button onClick={importWorld} disabled={busy}><Upload size={15} /> {t('Из файла')}</Button>
            <Button onClick={() => void api.openFolder('saves')}><FolderOpen size={15} /> {t('Открыть папку')}</Button>
          </>
        )}
      </div>

      {section === 'catalog' ? (
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            {([
              { id: 'adventure', label: t('Карты и приключения') },
              { id: 'datapack', label: t('Наборы данных') }
            ] as const).map((item) => (
              <button
                key={item.id}
                onClick={() => setCatalogKind(item.id)}
                className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
                  catalogKind === item.id ? 'border-mint-400/40 bg-mint-400/10 text-mint-300' : 'border-white/[0.08] text-slate-500 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <CatalogPanel
            key={catalogKind}
            kind={catalogKind === 'adventure' ? 'modpack' : 'datapack'}
            profileId={profileId}
            category={catalogKind === 'adventure' ? 'adventure' : 'worldgen'}
          />
        </div>
      ) : loading && !worlds.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="panel shimmer h-52 animate-shimmer" />)}
        </div>
      ) : filtered.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((world, index) => (
            <motion.div
              key={world.dirName}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index, 12) * 0.03 }}
              className="panel overflow-hidden"
            >
              <div className="relative h-24 overflow-hidden bg-gradient-to-br from-mint-500/20 via-ink-800 to-iris-600/30">
                {world.iconUrl && <img src={world.iconUrl} alt="" className="h-full w-full object-cover opacity-80" />}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-800 to-transparent" />
                <div className="absolute bottom-3 left-4"><Badge tone="mint"><Globe2 size={11} /> {t('Мир')}</Badge></div>
              </div>
              <div className="p-4">
                {renaming === world.dirName ? (
                  <div className="flex gap-2">
                    <input
                      className="input py-1.5 text-xs"
                      autoFocus
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void run(async () => {
                          await api.renameWorld(profileId, world.dirName, renameValue)
                          setRenaming(null)
                        })
                        if (event.key === 'Escape') setRenaming(null)
                      }}
                    />
                    <Button
                      onClick={() => void run(async () => {
                        await api.renameWorld(profileId, world.dirName, renameValue)
                        setRenaming(null)
                      })}
                    >{t('Сохранить')}</Button>
                  </div>
                ) : (
                  <div className="truncate text-sm font-bold text-white">{world.name}</div>
                )}
                <p className="mt-2 text-[11px] text-slate-500">
                  {world.version ? <span className="mr-2">{world.version}</span> : null}
                  {formatSize(world.size)}
                  {world.lastPlayed ? ` · ${new Date(world.lastPlayed).toLocaleDateString()}` : ''}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Button
                    title={t('Экспорт мира')}
                    disabled={busy || busyWorld === world.dirName}
                    onClick={() => {
                      setBusyWorld(world.dirName)
                      void api.exportWorld(profileId, world.dirName).finally(() => setBusyWorld(null))
                    }}
                  ><Download size={14} /> {t('Экспорт')}</Button>
                  <Button
                    title={t('Создать копию')}
                    disabled={busy}
                    onClick={() => void run(async () => { await api.createBackup(profileId) })}
                  ><Archive size={14} /> {t('Бэкап')}</Button>
                  <Button
                    title={t('Переименовать')}
                    disabled={busy}
                    onClick={() => {
                      setRenaming(world.dirName)
                      setRenameValue(world.name)
                    }}
                  ><Pencil size={14} /> {t('Имя')}</Button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Button
                    title={t('Открыть папку')}
                    onClick={() => void api.openFolder('saves')}
                  ><FolderOpen size={14} /> {t('Папка')}</Button>
                  <Button
                    title={t('Копировать в сборку')}
                    disabled={busy}
                    onClick={() => setCopyTarget(world.dirName)}
                  ><Copy size={14} /> {t('Копия')}</Button>
                  <Button
                    title={t('Удалить мир')}
                    disabled={busy}
                    onClick={() => void run(async () => { await api.deleteWorld(profileId, world.dirName) })}
                  ><Trash2 size={14} /> {t('Удалить')}</Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Globe2 size={22} />}
          title={t('Миров пока нет')}
          description={t('Импортируйте архив мира или скачайте карту из каталога.')}
          action={<Button onClick={importWorld}><Upload size={15} /> {t('Из файла')}</Button>}
        />
      )}

      {busyWorld && <div className="fixed bottom-6 left-1/2 -translate-x-1/2"><Spinner /></div>}

      {copyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={() => setCopyTarget(null)}>
          <div className="panel w-full max-w-md p-5" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{t('Копировать мир в сборку')}</h3>
              <button onClick={() => setCopyTarget(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X size={18} /></button>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {(state?.profiles ?? []).filter((item) => item.id !== profileId).map((item) => (
                <button
                  key={item.id}
                  onClick={() => void run(async () => {
                    await api.copyWorld(profileId, copyTarget, item.id)
                    setCopyTarget(null)
                  })}
                  className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left text-xs text-slate-200 transition hover:border-mint-400/30"
                >
                  <span className="truncate">{item.name}</span>
                  <span className="text-[10px] text-slate-500">{item.versionId} · {item.loader}</span>
                </button>
              ))}
              {state?.profiles.length === 1 && (
                <div className="py-6 text-center text-xs text-slate-500">{t('Других сборок пока нет')}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
