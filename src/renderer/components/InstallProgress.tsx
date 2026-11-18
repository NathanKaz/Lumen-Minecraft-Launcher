import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'
import { useLauncher } from '../store'
import { ProgressBar } from './ui'
import type { ProgressPhase } from '@shared/types'

const phaseNames: Record<ProgressPhase, string> = {
  version: 'Версия',
  libraries: 'Библиотеки',
  assets: 'Ассеты',
  loader: 'Загрузчик',
  mod: 'Мод',
  modpack: 'Модпак',
  launch: 'Запуск'
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 МБ'
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(2)} ГБ`
  return `${(bytes / 1e6).toFixed(1)} МБ`
}

function formatSpeed(speed: number): string {
  return speed > 1e6 ? `${(speed / 1e6).toFixed(1)} МБ/с` : `${Math.round(speed / 1000)} КБ/с`
}

export function InstallProgress(): JSX.Element | null {
  const { progress } = useLauncher()
  if (!progress) return null

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="panel p-5">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint-400/10 text-mint-400"><Zap size={16} /></span>
          <div>
            <div className="text-sm font-bold text-white">{phaseNames[progress.phase]}</div>
            <div className="text-[11px] text-slate-500">{progress.message}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-mint-300">{Math.round(progress.percent)}%</div>
          <div className="text-[10px] text-slate-500">{formatSpeed(progress.speed)}</div>
        </div>
      </div>
      <ProgressBar value={progress.percent} />
      <div className="mt-2 flex justify-between text-[10px] text-slate-600">
        <span>{formatBytes(progress.bytes)} из {formatBytes(progress.totalBytes)}</span>
        <span>{progress.total > 1 ? `${progress.current} / ${progress.total} файлов` : ''}</span>
      </div>
    </motion.div>
  )
}
