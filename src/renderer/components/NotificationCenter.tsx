import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { AlertCircle, BellOff, CheckCheck, CheckCircle2, Info, Trash2, X } from 'lucide-react'
import { t } from '../lib/i18n'
import { unreadCount, useLauncher } from '../store'
import { EmptyState } from './ui'

function relativeTime(time: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - time) / 60_000))
  if (minutes < 1) return t('Только что')
  if (minutes < 60) return t('{count} мин назад', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('{count} ч назад', { count: hours })
  return t('{count} дн назад', { count: Math.floor(hours / 24) })
}

export function NotificationCenter({ onClose }: { onClose: () => void }): JSX.Element {
  const { notifications, markNotificationsRead, clearNotifications } = useLauncher()
  const [now, setNow] = useState(() => Date.now())
  const panelRef = useRef<HTMLDivElement>(null)
  const unread = unreadCount(notifications)

  // Refresh relative timestamps while the panel stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (panelRef.current?.contains(target)) return
      // The titlebar bell toggles this panel itself; don't close it twice.
      if (target.closest('[data-notification-toggle]')) return
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [onClose])

  const sorted = [...notifications].sort((a, b) => b.time - a.time)

  return createPortal(
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.15 }}
      className="panel no-drag fixed right-3 top-12 z-50 w-[360px] max-w-[calc(100vw-1.5rem)] overflow-hidden"
    >
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-4 py-3">
        <h3 className="mr-auto text-xs font-bold text-white">{t('Уведомления')}</h3>
        {unread > 0 && (
          <button
            type="button"
            onClick={markNotificationsRead}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-semibold text-mint-300 transition hover:bg-mint-400/10"
          >
            <CheckCheck size={13} /> {t('Отметить всё прочитанным')}
          </button>
        )}
        <button
          type="button"
          onClick={clearNotifications}
          disabled={sorted.length === 0}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-default disabled:opacity-30"
        >
          <Trash2 size={12} /> {t('Очистить')}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('Закрыть')}
          className="rounded-lg p-1 text-slate-500 transition hover:bg-white/10 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-2">
        {sorted.length === 0 ? (
          <EmptyState
            icon={<BellOff size={20} />}
            title={t('Событий пока нет')}
            description={t('Новые уведомления появятся здесь.')}
          />
        ) : (
          <div className="space-y-1">
            {sorted.map((item) => {
              const Icon = item.type === 'success' ? CheckCircle2 : item.type === 'error' ? AlertCircle : Info
              const tone =
                item.type === 'success' ? 'text-mint-400' : item.type === 'error' ? 'text-rose-400' : 'text-iris-400'
              return (
                <div
                  key={item.id}
                  className={`flex gap-3 rounded-xl border px-3 py-2.5 ${
                    item.read ? 'border-white/[0.05] bg-white/[0.02]' : 'border-mint-400/15 bg-mint-400/[0.04]'
                  }`}
                >
                  <Icon size={15} className={`mt-0.5 shrink-0 ${tone}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed text-slate-200">{item.message}</p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                      <span>{relativeTime(item.time, now)}</span>
                      {!item.read && (
                        <span className="flex items-center gap-1 text-mint-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-mint-400" />
                          {t('Непрочитано')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>,
    document.body
  )
}
