import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'

export interface ContextMenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
}

export interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

export function ContextMenu({
  menu,
  onClose
}: {
  menu: ContextMenuState | null
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [menu, onClose])

  const width = 210
  const height = menu ? menu.items.length * 38 + 12 : 0
  const x = menu ? Math.max(8, Math.min(menu.x, window.innerWidth - width - 8)) : 0
  const y = menu ? Math.max(8, Math.min(menu.y, window.innerHeight - height - 8)) : 0

  return (
    <AnimatePresence>
      {menu && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.97, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: -4 }}
          transition={{ duration: 0.12 }}
          className="fixed z-[60] w-[210px] overflow-hidden rounded-xl border border-white/10 bg-ink-800/95 p-1.5 shadow-panel backdrop-blur-xl"
          style={{ left: x, top: y }}
          onContextMenu={(event) => event.preventDefault()}
        >
          {menu.items.map((item, index) => (
            <button
              key={`${item.label}-${index}`}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                onClose()
                item.onClick()
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                item.tone === 'danger'
                  ? 'text-rose-300 hover:bg-rose-500/15'
                  : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
