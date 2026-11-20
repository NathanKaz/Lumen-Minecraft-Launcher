import { useState } from 'react'
import { Bell, Minus, Square, X } from 'lucide-react'
import { t } from '../lib/i18n'
import { api, isMock } from '../lib/api'
import { unreadCount, useLauncher } from '../store'
import { NotificationCenter } from './NotificationCenter'

export function Titlebar(): JSX.Element {
  const { notifications } = useLauncher()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const unread = unreadCount(notifications)

  return (
    <div className="drag-region flex h-11 shrink-0 items-center justify-between border-b border-white/[0.05] bg-ink-950/60 px-4 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <div className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-gradient-to-br from-mint-300 to-mint-600 text-[10px] font-black text-ink-950">N</div>
        <span className="text-xs font-bold tracking-wide text-slate-300">LUMEN LAUNCHER</span>
        {isMock && <span className="rounded border border-iris-400/30 bg-iris-500/10 px-1.5 py-0.5 text-[9px] font-bold text-iris-400">DEMO</span>}
      </div>
      <div className="no-drag flex items-center gap-1">
        <button
          data-notification-toggle
          onClick={() => setNotificationsOpen((open) => !open)}
          className={`relative flex h-7 w-9 items-center justify-center rounded-md transition ${
            notificationsOpen ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/10 hover:text-white'
          }`}
          aria-label={t('Уведомления')}
          aria-expanded={notificationsOpen}
        >
          <Bell size={15} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-iris-500 px-1 text-[9px] font-bold text-white shadow">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
        <span className="mx-1 h-4 w-px bg-white/10" />
        <button
          onClick={() => void api.windowAction('minimize')}
          className="flex h-7 w-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/10 hover:text-white"
          aria-label={t("Свернуть")}
        >
          <Minus size={15} />
        </button>
        <button
          onClick={() => void api.windowAction('maximize')}
          className="flex h-7 w-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/10 hover:text-white"
          aria-label={t("Развернуть")}
        >
          <Square size={12} />
        </button>
        <button
          onClick={() => void api.windowAction('close')}
          className="flex h-7 w-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-rose-500/20 hover:text-rose-300"
          aria-label={t("Закрыть")}
        >
          <X size={15} />
        </button>
      </div>
      {notificationsOpen && <NotificationCenter onClose={() => setNotificationsOpen(false)} />}
    </div>
  )
}
