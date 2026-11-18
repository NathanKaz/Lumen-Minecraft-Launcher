import { useEffect, useState } from 'react'
import { CheckCircle2, Coffee, Copy, FolderOpen, RefreshCw, Terminal, Trash2, XCircle } from 'lucide-react'
import { api, isMock } from '../lib/api'
import { useLauncher } from '../store'
import { Badge, Button, SectionHeader, Spinner, Toggle } from '../components/ui'
import type { JavaInfo } from '@shared/types'

export function Settings(): JSX.Element {
  const { state, logs, refresh, pushToast } = useLauncher()
  const [java, setJava] = useState<JavaInfo | null>(null)
  const [detecting, setDetecting] = useState(false)

  useEffect(() => {
    void api.getJavaInfo().then(setJava).catch(() => setJava(null))
  }, [])

  if (!state) return <Spinner />
  const settings = state.settings

  const update = async (patch: Partial<typeof settings>) => {
    await api.setState({ settings: { ...settings, ...patch } })
    await refresh()
  }

  const detect = async () => {
    setDetecting(true)
    try {
      const result = await api.detectJava()
      setJava(result)
      await refresh()
      pushToast(result.valid ? 'success' : 'error', result.valid ? `Java ${result.version} найдена` : 'Java не найдена')
    } finally {
      setDetecting(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1060px]">
      <SectionHeader title="Настройки" subtitle="Пути, память, Java и журналы лаунчера." />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Coffee size={18} className="text-mint-400" />
            <h3 className="text-sm font-bold text-white">Java</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="label">Путь к Java</label>
              <div className="flex gap-2">
                <input
                  className="input font-mono text-xs"
                  placeholder="Автоопределение"
                  value={settings.javaPath}
                  onChange={(event) => void update({ javaPath: event.target.value })}
                />
                <Button onClick={() => void detect()} disabled={detecting}>
                  {detecting ? <Spinner size={14} /> : <RefreshCw size={15} />}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center gap-2">
                {java?.valid ? <CheckCircle2 size={16} className="text-mint-400" /> : <XCircle size={16} className="text-rose-400" />}
                <div>
                  <div className="text-xs font-semibold text-slate-200">Java {java?.version ?? '—'}</div>
                  <div className="truncate font-mono text-[10px] text-slate-500">{java?.path || 'не найдена'}</div>
                </div>
              </div>
              <Badge tone={java?.valid ? 'mint' : 'amber'}>{java?.valid ? 'Подходит' : 'Проверьте путь'}</Badge>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Для Minecraft 1.18+ нужна Java 17, для 1.20.5+ — Java 21. Лаунчер подберёт установленную версию автоматически.
            </p>
          </div>
        </div>

        <div className="panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Terminal size={18} className="text-iris-400" />
            <h3 className="text-sm font-bold text-white">Производительность</h3>
          </div>
          <div className="space-y-5">
            <div>
              <label className="label">Память по умолчанию: {settings.memory} МБ</label>
              <input
                type="range"
                min={1024}
                max={16384}
                step={512}
                value={settings.memory}
                style={{ '--range-value': `${((settings.memory - 1024) / 15360) * 100}%` } as React.CSSProperties}
                onChange={(event) => void update({ memory: Number(event.target.value) })}
                className="w-full"
              />
              <div className="mt-2 flex justify-between text-[10px] text-slate-600"><span>1 ГБ</span><span>16 ГБ</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Ширина окна</label>
                <input type="number" className="input" value={settings.width} onChange={(event) => void update({ width: Number(event.target.value) })} />
              </div>
              <div>
                <label className="label">Высота окна</label>
                <input type="number" className="input" value={settings.height} onChange={(event) => void update({ height: Number(event.target.value) })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div>
                <div className="text-xs font-semibold text-slate-200">Полноэкранный режим</div>
                <div className="text-[10px] text-slate-500">Игра запускается в полноэкранном режиме</div>
              </div>
              <Toggle checked={settings.fullscreen} onChange={() => void update({ fullscreen: !settings.fullscreen })} />
            </div>
          </div>
        </div>

        <div className="panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <FolderOpen size={18} className="text-amber-400" />
            <h3 className="text-sm font-bold text-white">Каталоги</h3>
          </div>
          <div className="grid gap-2">
            {([
              ['root', 'Данные лаунчера'],
              ['instances', 'Профили и миры'],
              ['mods', 'Моды активного профиля'],
              ['logs', 'Журналы']
            ] as const).map(([kind, label]) => (
              <button
                key={kind}
                onClick={() => void api.openFolder(kind)}
                className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left text-xs font-semibold text-slate-300 transition hover:border-mint-400/25 hover:text-mint-300"
              >
                {label} <FolderOpen size={15} />
              </button>
            ))}
          </div>
        </div>

        <div className="panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Terminal size={18} className="text-slate-400" />
            <h3 className="text-sm font-bold text-white">Общее</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div>
                <div className="text-xs font-semibold text-slate-200">Проверять обновления</div>
                <div className="text-[10px] text-slate-500">При запуске лаунчера</div>
              </div>
              <Toggle checked={settings.checkUpdates} onChange={() => void update({ checkUpdates: !settings.checkUpdates })} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div>
                <div className="text-xs font-semibold text-slate-200">Язык интерфейса</div>
                <div className="text-[10px] text-slate-500">Русский и английский</div>
              </div>
              <select
                className="input w-28 py-1.5 text-xs"
                value={settings.language}
                onChange={(event) => void update({ language: event.target.value as 'ru' | 'en' })}
              >
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </div>
            {isMock && <Badge tone="iris">Демо-режим: файлы не изменяются</Badge>}
          </div>
        </div>
      </div>

      <div className="panel mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2">
            <Terminal size={17} className="text-mint-400" />
            <h3 className="text-sm font-bold text-white">Журнал лаунчера</h3>
            <Badge>{logs.length}</Badge>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void navigator.clipboard.writeText(logs.map((log) => log.message).join('\n')).then(() => pushToast('success', 'Логи скопированы'))}>
              <Copy size={14} /> Копировать
            </Button>
            <Button onClick={() => void api.clearLogs().then(refresh)}><Trash2 size={14} /> Очистить</Button>
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto bg-ink-950/60 p-4 font-mono text-[11px] leading-relaxed">
          {logs.map((log, index) => (
            <div key={`${log.time}-${index}`} className="flex gap-3">
              <span className="shrink-0 text-slate-700">{new Date(log.time).toLocaleTimeString('ru-RU')}</span>
              <span className={log.level === 'error' ? 'text-rose-400' : log.level === 'warn' ? 'text-amber-400' : log.level === 'game' ? 'text-slate-400' : 'text-mint-400'}>
                {log.message}
              </span>
            </div>
          ))}
          {!logs.length && <div className="py-10 text-center text-slate-700">Журнал пуст</div>}
        </div>
      </div>
    </div>
  )
}
