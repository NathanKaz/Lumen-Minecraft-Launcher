import { Check } from 'lucide-react'
import { t } from '../lib/i18n'

export interface CategoryOption {
  id: string
  label: string
}

/** Multi-select Modrinth category chips shared by the shader and mod catalogs. */
export function CategoryTags({
  categories,
  active,
  onChange
}: {
  categories: CategoryOption[]
  active: string[]
  onChange: (next: string[]) => void
}): JSX.Element {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {categories.map((item) => {
        const selected = item.id ? active.includes(item.id) : active.length === 0
        return (
          <button
            key={item.id || 'all'}
            onClick={() => onChange(!item.id
              ? []
              : active.includes(item.id)
                ? active.filter((entry) => entry !== item.id)
                : [...active, item.id])}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
              selected
                ? 'border-mint-400/40 bg-mint-400/10 text-mint-300'
                : 'border-white/[0.08] text-slate-500 hover:text-slate-200'
            }`}
            title={item.id ? t('Можно выбрать несколько тегов') : t('Все')}
          >
            {selected && item.id && <Check size={11} />}
            {t(item.label)}
          </button>
        )
      })}
      {active.length > 1 && (
        <span className="ml-1 text-[10px] text-slate-500">
          {t('Выбрано тегов: {count}', { count: active.length })}
        </span>
      )}
    </div>
  )
}
