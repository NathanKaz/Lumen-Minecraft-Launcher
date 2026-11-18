import { Select, Toggle } from './ui'
import type { BuildGroup, LoaderType, Profile, VersionManifest } from '@shared/types'

export const loaders: Array<{ id: LoaderType; label: string; hint: string }> = [
  { id: 'vanilla', label: 'Vanilla', hint: 'Оригинальная игра' },
  { id: 'fabric', label: 'Fabric', hint: 'Лёгкие моды, высокая производительность' },
  { id: 'forge', label: 'Forge', hint: 'Классические крупные модпаки' },
  { id: 'neoforge', label: 'NeoForge', hint: 'Современный преемник Forge' }
]

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
  const releaseVersions = versions?.versions.filter((version) => version.type === 'release').slice(0, 30) ?? [
    { id: '1.21.4', type: 'release' as const, released: '' },
    { id: '1.20.1', type: 'release' as const, released: '' }
  ]

  return (
    <div className="space-y-5">
      <div>
        <label className="label">Название</label>
        <input className="input" value={profile.name} onChange={(event) => onChange({ ...profile, name: event.target.value })} />
      </div>
      <div>
        <label className="label">Версия Minecraft</label>
        <Select
          value={profile.versionId}
          onChange={(versionId) => onChange({ ...profile, versionId, loaderVersionId: undefined })}
          options={releaseVersions.map((version) => ({ value: version.id, label: `Minecraft ${version.id}` }))}
        />
      </div>
      <div>
        <label className="label">Загрузчик модов</label>
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
              <div className="mt-0.5 text-[10px] leading-tight text-slate-500">{loader.hint}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Группа</label>
        <Select
          value={profile.groupId ?? ''}
          onChange={(groupId) => onChange({ ...profile, groupId: groupId || undefined })}
          options={[
            { value: '', label: 'Без группы' },
            ...groups.map((group) => ({ value: group.id, label: group.name }))
          ]}
        />
      </div>
      {showMemory && (
        <div>
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div>
              <div className="text-xs font-semibold text-slate-200">Использовать глобальную память</div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                Сейчас по умолчанию: {settingsMemory} МБ. Снимите переключатель, чтобы задать своё значение.
              </div>
            </div>
            <Toggle
              checked={profile.memory === undefined}
              onChange={() => onChange({ ...profile, memory: profile.memory === undefined ? settingsMemory : undefined })}
            />
          </div>
          {profile.memory !== undefined && (
            <div className="mt-3">
              <label className="label">Память сборки: {profile.memory} МБ</label>
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
              <div className="mt-2 flex justify-between text-[10px] text-slate-600"><span>1 ГБ</span><span>16 ГБ</span></div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
