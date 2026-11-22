import { Keyboard } from 'lucide-react'
import { t } from '../lib/i18n'
import { HOTKEY_DEFINITIONS, formatShortcut, hotkeysFromSettings } from '@shared/hotkeys'
import { useLauncher } from '../store'
import { Modal } from './ui'

/** Read-only cheat sheet; the editable controls live in Settings → Hotkeys. */
export function ShortcutsSheet(): JSX.Element {
  const { state, shortcutsOpen, setShortcutsOpen } = useLauncher()
  const hotkeys = hotkeysFromSettings(state?.settings)
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

  return (
    <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title={t('Горячие клавиши')} width="max-w-2xl">
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <Keyboard size={18} className="shrink-0 text-mint-400" />
        <p className="text-[11px] leading-relaxed text-slate-400">
          {t('Сочетания работают в лаунчере. Переназначить их можно в Настройки → Горячие клавиши.')}
        </p>
      </div>
      <div className="space-y-1.5">
        {HOTKEY_DEFINITIONS.map((definition) => (
          <div key={definition.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-slate-100">{t(definition.label)}</div>
              <div className="truncate text-[10px] text-slate-500">{t(definition.hint)}</div>
            </div>
            <kbd className="shrink-0 rounded-lg border border-white/10 bg-ink-900 px-2.5 py-1 font-mono text-[11px] text-mint-300">
              {formatShortcut(hotkeys[definition.id], mac)}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  )
}
