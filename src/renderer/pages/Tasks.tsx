import { Pause, Play, RotateCcw, Trash2, X, Download } from 'lucide-react'
import { formatSize, formatSpeed, t } from '../lib/i18n'
import { useLauncher } from '../store'
import { ProgressBar } from '../components/ui'
import type { TaskInfo, TaskStatus } from '@shared/types'

const statusLabel: Record<TaskStatus, string> = {
  queued: 'В очереди',
  running: 'Выполняется',
  paused: 'Пауза',
  completed: 'Завершено',
  failed: 'Ошибка',
  canceled: 'Отменено'
}

const statusClass: Record<TaskStatus, string> = {
  queued: 'text-slate-400 bg-white/[0.04] border-white/[0.06]',
  running: 'text-mint-300 bg-mint-400/10 border-mint-400/20',
  paused: 'text-amber-300 bg-amber-400/10 border-amber-400/20',
  completed: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20',
  failed: 'text-red-300 bg-red-400/10 border-red-400/20',
  canceled: 'text-slate-400 bg-white/[0.04] border-white/[0.06]'
}

function TaskRow({ task }: { task: TaskInfo }): JSX.Element {
  const { cancelTask, pauseTask, resumeTask } = useLauncher()
  const progress = task.progress
  const percent = progress?.percent ?? (task.status === 'completed' ? 100 : 0)

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold text-white">{task.label}</div>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClass[task.status]}`}>
              {t(statusLabel[task.status])}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {progress?.message || task.error || t(statusLabel[task.status])}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {task.status === 'running' && task.canPause && (
            <button
              onClick={() => void pauseTask(task.id)}
              className="rounded-lg border border-white/[0.08] p-2 text-slate-300 transition hover:bg-white/[0.06]"
              title={t('Пауза')}
            >
              <Pause size={14} />
            </button>
          )}
          {(task.status === 'paused' || task.status === 'failed' || task.status === 'canceled') && task.canRetry && (
            <button
              onClick={() => void resumeTask(task.id)}
              className="rounded-lg border border-mint-400/20 bg-mint-400/[0.06] p-2 text-mint-300 transition hover:bg-mint-400/[0.12]"
              title={t('Повторить')}
            >
              {task.status === 'paused' ? <Play size={14} /> : <RotateCcw size={14} />}
            </button>
          )}
          {(task.status === 'running' || task.status === 'queued' || task.status === 'paused') && task.canCancel && (
            <button
              onClick={() => void cancelTask(task.id)}
              className="rounded-lg border border-red-400/20 bg-red-400/[0.05] p-2 text-red-300 transition hover:bg-red-400/[0.1]"
              title={t('Отмена')}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {(task.status === 'running' || task.status === 'paused' || task.status === 'queued' || progress) && (
        <div className="mt-3">
          <ProgressBar value={percent} />
          <div className="mt-1.5 flex justify-between text-[10px] text-slate-600">
            <span>{formatSize(progress?.bytes ?? 0)} {t('из')} {formatSize(progress?.totalBytes ?? 0)}</span>
            <span>{task.status === 'running' ? formatSpeed(progress?.speed ?? 0) : `${Math.round(percent)}%`}</span>
          </div>
        </div>
      )}

      {task.error && task.status === 'failed' && (
        <div className="mt-3 rounded-lg border border-red-400/15 bg-red-400/[0.05] px-3 py-2 text-[11px] text-red-200/80">
          {task.error}
        </div>
      )}
    </div>
  )
}

export function TasksPage(): JSX.Element {
  const { tasks, clearFinishedTasks } = useLauncher()
  const active = tasks.filter((task) => task.status === 'running' || task.status === 'queued' || task.status === 'paused')
  const finished = tasks.filter((task) => task.status === 'completed' || task.status === 'failed' || task.status === 'canceled')

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><Download size={22} className="text-mint-300" /> {t('Загрузки')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('Очередь задач, загрузки и установка')}</p>
        </div>
        {finished.length > 0 && (
          <button
            onClick={() => void clearFinishedTasks()}
            className="flex items-center gap-2 rounded-xl border border-white/[0.08] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05]"
          >
            <Trash2 size={14} /> {t('Очистить завершённые')}
          </button>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="panel p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-slate-500"><Download size={22} /></div>
          <div className="text-sm font-semibold text-slate-300">{t('Очередь пуста')}</div>
          <div className="mt-1 text-xs text-slate-500">{t('Здесь появятся установки, загрузки и обновления')}</div>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{t('Активные')} · {active.length}</h2>
              {active.map((task) => <TaskRow key={task.id} task={task} />)}
            </section>
          )}
          {finished.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{t('Завершённые')}</h2>
              {finished.map((task) => <TaskRow key={task.id} task={task} />)}
            </section>
          )}
        </>
      )}
    </div>
  )
}
