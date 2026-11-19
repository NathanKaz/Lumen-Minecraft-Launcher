import { useState } from 'react'
import { Check, Download, Loader2, Search } from 'lucide-react'
import { Select, Toggle } from './ui'
import { t } from '../lib/i18n'
import { api } from '../lib/api'
import { useLauncher } from '../store'
import type { BuildGroup, LoaderType, Profile, VersionManifest, VersionSummary } from '@shared/types'

export const loaders: Array<{ id: LoaderType; label: string; hintKey: string }> = [
  { id: 'vanilla', label: 'Vanilla', hintKey: 'Оригинальная игра' },
  { id: 'fabric', label: 'Fabric', hintKey: 'Лёгкие моды, высокая производительность' },
  { id: 'forge', label: 'Forge', hintKey: 'Классические крупные модпаки' },
  { id: 'neoforge', label: 'NeoForge', hintKey: 'Современный преемник Forge' }
]

type VersionType = VersionSummary['type']

const versionTypeLabel: Record<VersionType, string> = {
  release: 'Релиз',
  snapshot: 'Снапшот',
  old_beta: 'Бета',
  old_alpha: 'Альфа'
}

const versionTypes: VersionType[] = ['release', 'snapshot', 'old_beta', 'old_alpha']

const fallbackVersions: VersionSummary[] = [
  { id: '1.21.4', type: 'release', released: '', url: '' },
  { id: '1.20.1', type: 'release', released: '', url: '' },
  { id: '25w02a', type: 'snapshot', released: '', url: '' },
  { id: 'b1.8.1', type: 'old_beta', released: '', url: '' },
  { id: 'a1.2.6', type: 'old_alpha', released: '', url: '' }
]

function compatibilityWarnings(profile: Profile, selected: VersionSummary | undefined): string[] {
  if (profile.loader === 'vanilla' || !selected) return []
  const warnings: string[] = []
  if (selected.type === 'old_beta' || selected.type === 'old_alpha') {
    warnings.push(t('Современные загрузчики не поддерживают старые версии.'))
  } else if (selected.type === 'snapshot') {
    warnings.push(t('Загрузчик модов для снапшотов часто отстаёт от игры.'))
  }
  if (warnings.length === 0 && selected.type !== 'release') {
    warnings.push(t('Для {type} загрузчики могут быть недоступны или нестабильны.', { type: t(versionTypeLabel[selected.type]) }))
  }
  const [major = 1, minor = 0, patch = 0] = profile.versionId.split('.').map((part) => Number(part) || 0)
  if (profile.loader === 'neoforge' && (major < 1 || (major === 1 && (minor < 20 || (minor === 20 && patch < 1))))) {
    warnings.push(t('NeoForge доступен не для всех версий.'))
  }
  return warnings
}

export function ProfileFields({
  profile,
  onChange,
  versions,
  groups,
  settingsMemory,
  showMemory = false
}: {
  profile: Profile
  onChange: (profile: Profile) => void
  versions: VersionManifest | null
  groups: BuildGroup[]
  settingsMemory: number
  showMemory?: boolean
}): JSX.Element {
  const { pushToast } = useLauncher()
  const [shownTypes, setShownTypes] = useState<Set<VersionType>>(() => new Set(versionTypes))
  const [query, setQuery] = useState('')
  const [javaBusy, setJavaBusy] = useState(false)

  const allVersions = versions?.versions ?? fallbackVersions
  const selectedVersion = allVersions.find((version) => version.id === profile.versionId)
  const normalizedQuery = query.trim().toLowerCase()
  const matchingVersions = allVersions.filter((version) =>
    shownTypes.has(version.type) && (!normalizedQuery || version.id.toLowerCase().includes(normalizedQuery))
  )
  const visibleVersions = matchingVersions.slice(0, 200)
  // Keep the current version visible when editing a build whose version is
  // hidden by the filters, so saving the form never silently changes it.
  const versionOptions = selectedVersion && !visibleVersions.some((version) => version.id === selectedVersion.id)
    ? [selectedVersion, ...visibleVersions]
    : visibleVersions

  const allShown = shownTypes.size === versionTypes.length
  const warnings = compatibilityWarnings(profile, selectedVersion)

  const toggleType = (type: VersionType): void => {
    setShownTypes((current) => {
      const next = new Set(current)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const useDetectedJava = async (): Promise<void> => {
    try {
      const info = await api.getJavaInfo()
      if (!info.valid) throw new Error(t('Не удалось определить Java'))
      onChange({ ...profile, javaPath: info.path })
      pushToast('success', `${info.version} · ${info.path}`)
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : String(error))
    }
  }

  const installJava = async (): Promise<void> => {
    setJavaBusy(true)
    try {
      const info = await api.ensureJava(undefined, profile.id, true)
      onChange({ ...profile, javaPath: info.path })
      pushToast('success', t('Java {version} установлена: {path}', { version: info.version, path: info.path }))
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : String(error))
    } finally {
      setJavaBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="label">{t("Название")}</label>
        <input className="input" value={profile.name} onChange={(event) => onChange({ ...profile, name: event.target.value })} />
      </div>

      <div>
        <label className="label">{t("Версия Minecraft")}</label>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-500">{t('Показывать типы версий')}</span>
          <button
            type="button"
            onClick={() => setShownTypes(allShown ? new Set<VersionType>() : new Set(versionTypes))}
            className="text-[10px] font-semibold text-mint-300 hover:text-mint-200"
          >
            {t(allShown ? 'Скрыть все' : 'Показать все')}
          </button>
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {versionTypes.map((type) => {
            const active = shownTypes.has(type)
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  active
                    ? 'border-mint-400/40 bg-mint-400/10 text-mint-300'
                    : 'border-white/[0.07] bg-white/[0.02] text-slate-500 hover:border-white/20 hover:text-slate-300'
                }`}
              >
                {active && <Check size={11} />}
                {t(versionTypeLabel[type])}
              </button>
            )
          })}
        </div>
        <div className="relative mb-2">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-9"
            placeholder={t('Поиск версии')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select
          value={profile.versionId}
          onChange={(versionId) => onChange({ ...profile, versionId, loaderVersionId: undefined })}
          options={versionOptions.map((version) => ({
            value: version.id,
            label: `Minecraft ${version.id} · ${t(versionTypeLabel[version.type])}`
          }))}
        />
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
          <span>{t('Найдено версий: {count}', { count: matchingVersions.length })}</span>
          {shownTypes.size === 0 && <span className="text-amber-300/80">{t('Выберите хотя бы один тип версии')}</span>}
        </div>
        {selectedVersion && selectedVersion.type !== 'release' && (
          <p className="mt-2 text-[11px] leading-relaxed text-amber-300/80">
            {t('Снапшоты и беты нестабильны: возможны баги и несовместимость модов.')}
          </p>
        )}
      </div>

      <div>
        <label className="label">{t("Загрузчик модов")}</label>
        <div className="grid grid-cols-2 gap-2">
          {loaders.map((loader) => (
            <button
              key={loader.id}
              type="button"
              onClick={() => onChange({ ...profile, loader: loader.id, loaderVersionId: undefined })}
              className={`rounded-xl border p-3 text-left transition ${
                profile.loader === loader.id
                  ? 'border-mint-400/50 bg-mint-400/[0.08]'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
              }`}
            >
              <div className="text-xs font-bold text-white">{loader.label}</div>
              <div className="mt-0.5 text-[10px] leading-tight text-slate-500">{t(loader.hintKey)}</div>
            </button>
          ))}
        </div>
        {warnings.length > 0 && (
          <div className="mt-2 space-y-1">
            {warnings.map((warning) => (
              <p key={warning} className="text-[11px] leading-relaxed text-amber-300/80">⚠ {warning}</p>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div>
          <label className="label">{t('Java для сборки')}</label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={t('Использовать Java по умолчанию')}
              value={profile.javaPath ?? ''}
              onChange={(event) => onChange({ ...profile, javaPath: event.target.value || undefined })}
            />
            <button type="button" className="btn btn-ghost px-3" onClick={() => void useDetectedJava()}>
              {t('Авто')}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] leading-relaxed text-slate-500">{t('Если подходящая Java не найдена, лаунчер скачает JRE.')}</p>
          <button type="button" className="btn btn-ghost shrink-0 px-3" disabled={javaBusy} onClick={() => void installJava()}>
            {javaBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {t('Установить нужную Java')}
          </button>
        </div>
        <div>
          <label className="label">{t('JVM-аргументы')}</label>
          <textarea
            className="input min-h-[64px] resize-y py-2"
            placeholder={t('Например: -XX:+UseG1GC -Dfile.encoding=UTF-8')}
            value={profile.jvmArgs ?? ''}
            onChange={(event) => onChange({ ...profile, jvmArgs: event.target.value || undefined })}
          />
          <p className="mt-1 text-[10px] text-slate-500">{t('Дополнительные флаги JVM для этой сборки.')}</p>
        </div>
      </div>

      <div>
        <label className="label">{t("Группа")}</label>
        <Select
          value={profile.groupId ?? ''}
          onChange={(groupId) => onChange({ ...profile, groupId: groupId || undefined })}
          options={[
            { value: '', label: t("Без группы") },
            ...groups.map((group) => ({ value: group.id, label: group.name }))
          ]}
        />
      </div>

      {showMemory && (
        <div>
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div>
              <div className="text-xs font-semibold text-slate-200">{t("Использовать глобальную память")}</div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                {t('Сейчас по умолчанию: {memory} МБ. Снимите переключатель, чтобы задать своё значение.', { memory: settingsMemory })}
              </div>
            </div>
            <Toggle
              checked={profile.memory === undefined}
              onChange={() => onChange({ ...profile, memory: profile.memory === undefined ? settingsMemory : undefined })}
            />
          </div>
          {profile.memory !== undefined && (
            <div className="mt-3">
              <label className="label">{t('Память сборки: {memory} МБ', { memory: profile.memory })}</label>
              <input
                type="range"
                min={1024}
                max={16384}
                step={512}
                value={profile.memory}
                style={{ '--range-value': `${((profile.memory - 1024) / 15360) * 100}%` } as React.CSSProperties}
                onChange={(event) => onChange({ ...profile, memory: Number(event.target.value) })}
                className="w-full"
              />
              <div className="mt-2 flex justify-between text-[10px] text-slate-600"><span>{t("1 ГБ")}</span><span>{t("16 ГБ")}</span></div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
