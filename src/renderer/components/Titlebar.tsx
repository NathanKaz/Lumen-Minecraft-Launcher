import { Minus, Square, X } from 'lucide-react'
import { api, isMock } from '../lib/api'

export function Titlebar(): JSX.Element {
  return (
    <div className="drag-region flex h-11 shrink-0 items-center justify-between border-b border-white/[0.05] bg-ink-950/60 px-4 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <div className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-gradient-to-br from-mint-300 to-mint-600 text-[10px] font-black text-ink-950">N</div>
        <span className="text-xs font-bold tracking-wide text-slate-300">NEON LAUNCHER</span>
        {isMock && <span className="rounded border border-iris-400/30 bg-iris-500/10 px-1.5 py-0.5 text-[9px] font-bold text-iris-400">DEMO</span>}
      </div>
      <div className="no-drag flex items-center gap-1">
        <button
          onClick={() => void api.windowAction('minimize')}
          className="flex h-7 w-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/10 hover:text-white"
          aria-label="Свернуть"
        >
          <Minus size={15} />
        </button>
        <button
          onClick={() => void api.windowAction('maximize')}
          className="flex h-7 w-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/10 hover:text-white"
          aria-label="Развернуть"
        >
          <Square size={12} />
        </button>
        <button
          onClick={() => void api.windowAction('close')}
          className="flex h-7 w-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-rose-500/20 hover:text-rose-300"
          aria-label="Закрыть"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
