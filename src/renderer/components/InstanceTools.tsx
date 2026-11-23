import { useEffect, useState } from 'react'
import { Archive, CheckCircle2, HardDriveDownload, Layers, RotateCcw, Search, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { api } from '../lib/api'
import { formatSize, t } from '../lib/i18n'
import { useLauncher } from '../store'
import { Badge, Button, Spinner, Toggle } from './ui'
import { CatalogPanel } from './CatalogPanel'
import { CompatibilityPanel } from './CompatibilityPanel'
import type { BackupInfo, PackInfo, PackKind, Profile, VerifyReport } from '@shared/types'

function formatDate(value: number): string {
  return new Date(value).toLocaleString()
}

function Verification({ profile }: { profile: Profile }): JSX.Element {
  const { pushToast } = useLauncher()
  const [report, setReport] = useState<VerifyReport | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (repair = false) => {
    setBusy(true)
    setReport(null)
    try {
      const result = await api.verifyProfile(profile.id, repair)
      setReport(result)
      pushToast(result.ok ? 'success' : 'error', result.ok
        ? t('Файлы в порядке')
        : t('Найдено проблем: {count}', { count: result.missing.length + result.invalid.length }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-white"><ShieldCheck size={17} className="text-mint-400" /> {t('Проверить файлы')}</div>
          <p className="mt-1 text-[11px] text-slate-500">{t('Сверяет клиент, библиотеки и ассеты с контрольными суммами Mojang.')}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void run(false)} disabled={busy}>{busy ? <Spinner size={14} /> : <ShieldCheck size={15} />} {t('Проверить')}</Button>
          <Button onClick={() => void run(true)} disabled={busy}><HardDriveDownload size={15} /> {t('Проверить и восстановить')}</Button>
        </div>
      </div>
      {report && (
        <div className={`rounded-xl border p-4 text-xs ${report.ok ? 'border-mint-400/30 bg-mint-400/[0.06] text-mint-300' : 'border-amber-400/30 bg-amber-400/[0.06] text-amber-300'}`}>
          <div className="flex items-center gap-2 font-semibold">
            {report.ok ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}
            {report.ok ? t('Файлы в порядке') : t('Проверено файлов: {count}', { count: report.checked })}
          </div>
          {!report.ok && (
            <div className="mt-2 space-y-1 text-[11px]">
              <div>{t('Отсутствует файлов: {count}', { count: report.missing.length })}</div>
              <div>{t('Повреждено файлов: {count}', { count: report.invalid.length })}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Backups({ profile }: { profile: Profile }): JSX.Element {
  const { pushToast } = useLauncher()
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      setBackups(await api.listBackups(profile.id))
    } catch {
      setBackups([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [profile.id])

  const create = async () => {
    setBusy(true)
    try {
      await api.createBackup(profile.id)
      await load()
      pushToast('success', t('Резервная копия создана'))
    } finally {
      setBusy(false)
    }
  }

  const restore = async (backup: BackupInfo) => {
    setBusy(true)
    try {
      await api.restoreBackup(profile.id, backup.fileName)
      pushToast('success', t('Миры восстановлены'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (backup: BackupInfo) => {
    setBusy(true)
    try {
      await api.deleteBackup(profile.id, backup.fileName)
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-white"><Archive size={17} className="text-amber-400" /> {t('Резервные копии миров')}</div>
          <p className="mt-1 text-[11px] text-slate-500">{t('Копии папки saves этой сборки. Восстановление заменяет текущие миры.')}</p>
        </div>
        <Button onClick={() => void create()} disabled={busy}>{busy ? <Spinner size={14} /> : <Archive size={15} />} {t('Создать копию')}</Button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8"><Spinner size={20} /></div>
      ) : backups.length ? (
        <div className="space-y-2">
          {backups.map((backup) => (
            <div key={backup.fileName} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-slate-100">{backup.name}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">{formatDate(backup.createdAt)} · {formatSize(backup.size)}</div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => void restore(backup)} disabled={busy}><RotateCcw size={14} /> {t('Восстановить')}</Button>
                <Button onClick={() => void remove(backup)} disabled={busy}><Trash2 size={14} /> {t('Удалить')}</Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-slate-500">
          {t('Резервных копий пока нет.')}
        </div>
      )}
    </div>
  )
}

function Packs({ profile }: { profile: Profile }): JSX.Element {
  const { pushToast } = useLauncher()
  const [kind, setKind] = useState<PackKind>('resource')
  const [packs, setPacks] = useState<PackInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showCatalog, setShowCatalog] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      setPacks(await api.listPacks(profile.id, kind))
    } catch {
      setPacks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [profile.id, kind])

  useEffect(() => {
    if (!showCatalog) void load()
  }, [showCatalog])

  const install = async () => {
    setBusy(true)
    try {
      await api.installPack(profile.id, kind)
      await load()
      pushToast('success', t(kind === 'resource' ? 'Набор ресурсов установлен' : 'Набор шейдеров установлен'))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (pack: PackInfo, enabled: boolean) => {
    setPacks((current) => current.map((entry) => entry.fileName === pack.fileName ? { ...entry, enabled } : entry))
    await api.togglePack(profile.id, kind, pack.fileName, enabled)
  }

  const remove = async (pack: PackInfo) => {
    setBusy(true)
    try {
      await api.deletePack(profile.id, kind, pack.fileName)
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
          {(['resource', 'shader'] as const).map((value) => (
            <button
              key={value}
              onClick={() => setKind(value)}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${kind === value ? 'bg-mint-400/10 text-mint-300' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {t(value === 'resource' ? 'Наборы ресурсов' : 'Шейдеры')}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowCatalog((value) => !value)}>
            {showCatalog ? <Layers size={14} /> : <Search size={14} />}
            {showCatalog ? t('Установленные') : t('Каталог')}
          </Button>
          {!showCatalog && (
            <Button onClick={() => void install()} disabled={busy}>
              {busy ? <Spinner size={14} /> : <Upload size={15} />} {t('Добавить')}
            </Button>
          )}
        </div>
      </div>
      {showCatalog ? (
        <CatalogPanel
          key={kind}
          kind={kind === 'resource' ? 'resourcepack' : 'shader'}
          profileId={profile.id}
        />
      ) : loading ? (
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
          {t(kind === 'resource' ? 'Наборов ресурсов пока нет.' : 'Наборов шейдеров пока нет.')}
        </div>
      )}
    </div>
  )
}

export function InstanceTools({ profile }: { profile: Profile }): JSX.Element {
  const [section, setSection] = useState<'verify' | 'compat' | 'backups' | 'packs'>('verify')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {([
          { id: 'verify', label: t('Проверить файлы'), icon: ShieldCheck },
          { id: 'compat', label: t('Совместимость'), icon: ShieldCheck },
          { id: 'backups', label: t('Бэкапы миров'), icon: Archive },
          { id: 'packs', label: t('Ресурсы и шейдеры'), icon: Layers }
        ] as const).map((item) => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition ${section === item.id ? 'border-mint-400/40 bg-mint-400/10 text-mint-300' : 'border-white/[0.06] text-slate-500 hover:text-slate-300'}`}
          >
            <item.icon size={14} /> {item.label}
          </button>
        ))}
      </div>
      {section === 'verify' && <Verification profile={profile} />}
      {section === 'compat' && <CompatibilityPanel profileId={profile.id} />}
      {section === 'backups' && <Backups profile={profile} />}
      {section === 'packs' && <Packs profile={profile} />}
    </div>
  )
}
