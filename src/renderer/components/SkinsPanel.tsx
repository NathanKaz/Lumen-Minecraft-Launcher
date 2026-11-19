import { useEffect, useState } from 'react'
import { Check, Plus, Trash2, Upload } from 'lucide-react'
import { api } from '../lib/api'
import { formatSize, t } from '../lib/i18n'
import { useLauncher } from '../store'
import { Badge, Button, Select, Spinner } from './ui'
import { Skin3DPreview } from './Skin3DPreview'
import type { SkinInfo, SkinModel } from '@shared/types'

export function SkinsPanel(): JSX.Element {
  const { refresh, pushToast } = useLauncher()
  const [skins, setSkins] = useState<SkinInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      setSkins(await api.listSkins())
    } catch {
      setSkins([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const importSkin = async () => {
    setBusy(true)
    try {
      const skin = await api.importSkin()
      if (skin) {
        await load()
        pushToast('success', t('Скин загружен'))
      }
    } finally {
      setBusy(false)
    }
  }

  const remove = async (skin: SkinInfo) => {
    setBusy(true)
    try {
      await api.deleteSkin(skin.id)
      await load()
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const select = async (skin: SkinInfo) => {
    setBusy(true)
    try {
      await api.selectSkin(skin.active ? null : skin.id)
      await load()
      await refresh()
      pushToast('success', t(skin.active ? 'Скин снят' : 'Скин применён'))
    } finally {
      setBusy(false)
    }
  }

  const setModel = async (skin: SkinInfo, model: SkinModel) => {
    await api.setSkinModel(skin.id, model)
    await load()
  }

  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Upload size={18} className="text-iris-400" />
          <h3 className="text-sm font-bold text-white">{t('Скины')}</h3>
        </div>
        <Button onClick={() => void importSkin()} disabled={busy}>
          {busy ? <Spinner size={14} /> : <Plus size={15} />} {t('Загрузить скин')}
        </Button>
      </div>

      <p className="mb-4 text-[11px] leading-relaxed text-slate-500">
        {t('В офлайн-режиме скин виден только вам: другие игроки не получают подпись Mojang.')}
      </p>

      {!loading && skins.length > 0 && (
        <div className="mb-4 flex items-center gap-4 rounded-xl border border-white/[0.06] bg-ink-950/60 p-4">
          <div className="h-40 w-32 shrink-0">
            <Skin3DPreview
              dataUrl={(skins.find((skin) => skin.active) ?? skins[0]).dataUrl}
              model={(skins.find((skin) => skin.active) ?? skins[0]).model}
              className="h-full w-full"
            />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white">{t('Предпросмотр скина')}</div>
            <div className="mt-1 truncate text-[11px] text-slate-400">
              {(skins.find((skin) => skin.active) ?? skins[0]).name}
            </div>
            <div className="mt-2 text-[10px] text-slate-600">{t('Перетащите, чтобы повернуть')}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8"><Spinner size={20} /></div>
      ) : skins.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {skins.map((skin) => (
            <div key={skin.id} className={`flex items-center gap-3 rounded-xl border p-3 transition ${skin.active ? 'border-mint-400/40 bg-mint-400/[0.06]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
              <div className="h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-gradient-to-b from-ink-900 to-ink-950">
                {skin.dataUrl
                  ? <Skin3DPreview dataUrl={skin.dataUrl} model={skin.model} className="h-full w-full" />
                  : <div className="flex h-full w-full items-center justify-center"><Upload size={20} className="text-slate-600" /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-semibold text-slate-100">{skin.name}</span>
                  {skin.active && <Badge tone="mint"><Check size={10} /> {t('Активный')}</Badge>}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">{formatSize(skin.size)}</div>
                <div className="mt-2 w-28">
                  <Select
                    value={skin.model}
                    onChange={(value) => void setModel(skin, value as SkinModel)}
                    options={[
                      { value: 'wide', label: t('Широкий') },
                      { value: 'slim', label: t('Узкий') }
                    ]}
                  />
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <Button onClick={() => void select(skin)} disabled={busy}>{skin.active ? t('Снять') : t('Использовать')}</Button>
                <Button onClick={() => void remove(skin)} disabled={busy}><Trash2 size={14} /> {t('Удалить')}</Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-slate-500">
          {t('Скинов пока нет. Загрузите PNG 64×64 или 64×32.')}
        </div>
      )}
    </div>
  )
}
