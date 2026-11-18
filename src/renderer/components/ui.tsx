import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, X } from 'lucide-react'
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

export function Button({
  children,
  variant = 'ghost',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }): JSX.Element {
  const styles = variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : 'btn-ghost'
  return (
    <button className={`${styles} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'mint' | 'iris' | 'amber' }): JSX.Element {
  const tones = {
    slate: 'border-white/10 bg-white/5 text-slate-300',
    mint: 'border-mint-400/25 bg-mint-400/10 text-mint-300',
    iris: 'border-iris-400/25 bg-iris-400/10 text-iris-400',
    amber: 'border-amber-400/25 bg-amber-400/10 text-amber-300'
  }
  return <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>
}

export interface SelectOption {
  value: string
  label: string
}

export function Select({
  value,
  onChange,
  options,
  className = '',
  placeholder = 'Выберите...',
  disabled = false
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  className?: string
  placeholder?: string
  disabled?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    const onOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-left text-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-45 ${
          open
            ? 'border-mint-400/60 bg-ink-900 ring-2 ring-mint-400/10'
            : 'border-white/[0.08] bg-ink-900/80 hover:border-white/20 focus:border-mint-400/60 focus:ring-2 focus:ring-mint-400/10'
        }`}
      >
        <span className={`truncate ${selected ? 'text-slate-100' : 'text-slate-500'}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute z-50 mt-1.5 max-h-60 w-full overflow-y-auto rounded-xl border border-white/10 bg-ink-800/95 p-1.5 shadow-panel backdrop-blur-xl"
          >
            {options.map((option) => {
              const active = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${
                    active ? 'bg-mint-400/10 text-mint-300' : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {active && <Check size={13} className="shrink-0" />}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${checked ? 'border-mint-400/50 bg-mint-500/70' : 'border-white/10 bg-white/10'} disabled:opacity-40`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow ${checked ? 'left-[22px]' : 'left-0.5'}`}
        style={{ height: 18, width: 18 }}
      />
    </button>
  )
}

export function ProgressBar({ value, tone = 'mint' }: { value: number; tone?: 'mint' | 'iris' }): JSX.Element {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.07]">
      <motion.div
        className={`h-full rounded-full ${tone === 'mint' ? 'bg-gradient-to-r from-mint-500 to-mint-300' : 'bg-gradient-to-r from-iris-600 to-iris-400'}`}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ duration: 0.25 }}
      />
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg'
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: string
}): JSX.Element {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            className={`panel w-full ${width} overflow-hidden`}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
              <h3 className="text-base font-bold text-white">{title}</h3>
              <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Spinner({ size = 18 }: { size?: number }): JSX.Element {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size }}
    />
  )
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.05] text-slate-400">{icon}</div>
      <h3 className="font-bold text-slate-200">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }): JSX.Element {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="title">{title}</h2>
        {subtitle && <p className="subtitle mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
