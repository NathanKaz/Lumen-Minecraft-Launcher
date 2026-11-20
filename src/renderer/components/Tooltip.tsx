import { useId, useState, type ReactNode } from 'react'

/** Small hover/focus hint. Keeps the trigger accessible without extra deps. */
export function Tooltip({ content, children }: { content: string; children: ReactNode }): JSX.Element {
  const [visible, setVisible] = useState(false)
  const id = useId()

  return (
    <span
      className="relative inline-flex shrink-0 items-center"
      tabIndex={0}
      aria-label={content}
      aria-describedby={visible ? id : undefined}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          id={id}
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[240px] -translate-x-1/2 rounded-lg border border-white/10 bg-ink-950/95 px-2.5 py-1.5 text-left text-[10px] font-normal leading-snug normal-case text-slate-200 shadow-panel"
        >
          {content}
        </span>
      )}
    </span>
  )
}
