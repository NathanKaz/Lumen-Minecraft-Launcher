import { useState } from 'react'
import { motion } from 'framer-motion'
import { Boxes, Check, Download, Gamepad2, Layers3, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, Button, EmptyState, Modal, SectionHeader, Spinner } from '../components/ui'
import type { LoaderType, Profile } from '@shared/types'

const loaders: Array<{ id: LoaderType; label: string; hint: string }> = [
  { id: 'vanilla', label: 'Vanilla', hint: 'Оригинальная игра' },
  { id: 'fabric', label: 'Fabric', hint: 'Лёгкие моды, высокая производительность' },
  { id: 'forge', label: 'Forge', hint: 'Классические крупные модпаки' },
  { id: 'neoforge', label: 'NeoForge', hint: 'Современный преемник Forge' }
]

const emptyProfile = (version: string): Profile => ({
  id: crypto.randomUUID(),
  name: 'Новый профиль',
  versionId: version,
  loader: 'fabric',
  memory: 2048,
  createdAt: Date.now(),
  playtimeMinutes: 0
})

export function Instances(): JSX.Element {
  const { state, versions, busy, setBusy, refresh, pushToast, setPage } = useLauncher()
  const [editing, setEditing] = useState<Profile | null>(null)
  const [creating, setCreating] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)

  if (!state) return <Spinner />

  const releaseVersions = versions?.versions.filter((version) => version.type === 'release').slice(0, 30) ?? [
    { id: '1.21.4', type: 'release' as const, released: '' },
    { id: '1.20.1', type: 'release' as const, released: '' }
  ]

  const openCreate = () => {
    setEditing(emptyProfile(versions?.latest.release ?? '1.20.1'))
    setCreating(true)
  }

  const save = async () => {
    if (!editing) return
    setBusy(true)
    try {
      if (creating) await api.createProfile(editing)
      else await api.updateProfile(editing.id, editing)
      await refresh()
      pushToast('success', creating ? 'Профиль создан' : 'Профиль сохранён')
      setEditing(null)
      setCreating(false)
    } finally {
      setBusy(false)
    }
  }

  const install = async (profile: Profile) => {
    setInstalling(profile.id)
    setBusy(true)
    try {
      await api.installProfile(profile.id)
      await refresh()
      pushToast('success', `${profile.name}: установка завершена`)
    } finally {
      setInstalling(null)
      setBusy(false)
    }
  }

  const remove = async (profile: Profile) => {
    if (!confirm(`Удалить профиль «${profile.name}»? Файлы игры останутся на диске.`)) return
    await api.deleteProfile(profile.id)
    await refresh()
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <SectionHeader
        title="Профили"
        subtitle="Каждый профиль — отдельная версия игры со своими модами и настройками."
        action={<Button variant="primary" onClick={openCreate}><Plus size={16} /> Создать профиль</Button>}
      />

      {state.profiles.length === 0 ? (
        <EmptyState
          icon={<Boxes size={22} />}
          title="Пока нет профилей"
          description="Создайте первый профиль, чтобы установить Minecraft и моды."
          action={<Button variant="primary" onClick={openCreate}><Plus size={16} /> Создать профиль</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {state.profiles.map((profile, index) => {
            const active = profile.id === state.selectedProfileId
            const installed = state.installedVersions.includes(profile.loaderVersionId ?? profile.versionId)
            return (
              <motion.div
                key={profile.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className={`panel relative overflow-hidden p-5 transition ${active ? 'border-mint-400/35 shadow-glow' : 'hover:border-white/15'}`}
              >
                <div className={`absolute inset-x-0 top-0 h-1 ${active ? 'bg-gradient-to-r from-mint-400 to-iris-500' : 'bg-white/5'}`} />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-iris-500/25 to-mint-500/20 text-iris-400">
                      {profile.modpack ? <Layers3 size={20} /> : <Gamepad2 size={20} />}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-bold text-white">{profile.name}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">Minecraft {profile.versionId}</div>
                    </div>
                  </div>
                  {active && <Badge tone="mint"><Check size={11} /> Активный</Badge>}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone="iris">{profile.loader.toUpperCase()}</Badge>
                  <Badge tone={installed ? 'mint' : 'slate'}>{installed ? 'Установлен' : 'Не установлен'}</Badge>
                  {profile.modpack && <Badge tone="amber">{profile.modpack.name}</Badge>}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4 text-[11px] text-slate-500">
                  <span>{profile.playtimeMinutes} мин в игре</span>
                  <span>{profile.memory} МБ RAM</span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {!active && (
                    <Button onClick={async () => { await api.setState({ selectedProfileId: profile.id }); await refresh() }} className="flex-1">
                      Выбрать
                    </Button>
                  )}
                  <Button
                    onClick={() => void install(profile)}
                    disabled={busy || installing === profile.id}
                    variant={active ? 'primary' : 'ghost'}
                    className="flex-1"
                  >
                    {installing === profile.id ? <Spinner size={14} /> : <Download size={15} />} Установить
                  </Button>
                  <button onClick={() => { setEditing({ ...profile }); setCreating(false) }} className="rounded-xl border border-white/[0.08] p-2.5 text-slate-400 transition hover:bg-white/10 hover:text-white" title="Изменить">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => void remove(profile)} className="rounded-xl border border-white/[0.08] p-2.5 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300" title="Удалить">
                    <Trash2 size={15} />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={creating ? 'Новый профиль' : 'Редактирование профиля'}>
        {editing && (
          <div className="space-y-5">
            <div>
              <label className="label">Название</label>
              <input className="input" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
            </div>
            <div>
              <label className="label">Версия Minecraft</label>
              <select
                className="input"
                value={editing.versionId}
                onChange={(event) => setEditing({ ...editing, versionId: event.target.value, loaderVersionId: undefined })}
              >
                {releaseVersions.map((version) => <option key={version.id} value={version.id}>{version.id}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Загрузчик модов</label>
              <div className="grid grid-cols-2 gap-2">
                {loaders.map((loader) => (
                  <button
                    key={loader.id}
                    onClick={() => setEditing({ ...editing, loader: loader.id, loaderVersionId: undefined })}
                    className={`rounded-xl border p-3 text-left transition ${
                      editing.loader === loader.id
                        ? 'border-mint-400/50 bg-mint-400/[0.08]'
                        : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <div className="text-xs font-bold text-white">{loader.label}</div>
                    <div className="mt-0.5 text-[10px] leading-tight text-slate-500">{loader.hint}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Память: {editing.memory} МБ</label>
              <input
                type="range"
                min={1024}
                max={16384}
                step={512}
                value={editing.memory}
                style={{ '--range-value': `${((editing.memory - 1024) / 15360) * 100}%` } as React.CSSProperties}
                onChange={(event) => setEditing({ ...editing, memory: Number(event.target.value) })}
                className="w-full"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setEditing(null)}>Отмена</Button>
              <Button variant="primary" onClick={() => void save()} disabled={busy || !editing.name.trim()}>
                {busy ? <Spinner size={14} /> : null} Сохранить
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
