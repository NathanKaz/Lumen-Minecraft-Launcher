import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useEffect } from 'react'
import { useLauncher } from '../store'

export function ToastHost(): JSX.Element {
  const { toasts, dismissToast } = useLauncher()

  useEffect(() => {
    if (!toasts.length) return
    const timers = toasts.map((toast) => setTimeout(() => dismissToast(toast.id), 5000))
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismissToast])

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[340px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Info
          const tone = toast.type === 'success' ? 'text-mint-400' : toast.type === 'error' ? 'text-rose-400' : 'text-iris-400'
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 30, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 30, scale: 0.96 }}
              className="panel pointer-events-auto flex items-start gap-3 px-4 py-3"
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${tone}`} />
              <p className="flex-1 text-xs leading-relaxed text-slate-200">{toast.message}</p>
              <button onClick={() => dismissToast(toast.id)} className="text-slate-600 transition hover:text-white">
                <X size={14} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
