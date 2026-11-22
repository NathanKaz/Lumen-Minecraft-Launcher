import { emitProgress, emitProgressDone, emitTasks, uid } from './events'
import type { ProgressPayload, ProgressPhase, TaskInfo, TaskStatus } from '@shared/types'

interface ManagedTask {
  info: TaskInfo
  action: (signal: AbortSignal) => Promise<void>
  controller: AbortController | null
}

const tasks: ManagedTask[] = []
const queue: string[] = []
let activeCount = 0
const CONCURRENCY = 2

function snapshot(): TaskInfo[] {
  return tasks
    .map((task) => ({ ...task.info, progress: task.info.progress ? { ...task.info.progress } : null }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

function publish(): void {
  emitTasks(snapshot())
}

function getTask(id: string): ManagedTask | undefined {
  return tasks.find((task) => task.info.id === id)
}

function setStatus(task: ManagedTask, status: TaskStatus, patch: Partial<TaskInfo> = {}): void {
  task.info = { ...task.info, ...patch, status, updatedAt: Date.now() }
  publish()
}

function pump(): void {
  while (activeCount < CONCURRENCY && queue.length > 0) {
    const id = queue.shift()
    if (!id) break
    const task = getTask(id)
    if (!task || task.info.status !== 'queued') continue
    void execute(task)
  }
}

async function execute(task: ManagedTask): Promise<void> {
  activeCount++
  task.controller = new AbortController()
  setStatus(task, 'running', {
    error: undefined,
    canCancel: true,
    canPause: true,
    canRetry: false
  })
  try {
    await task.action(task.controller.signal)
    if (task.info.status === 'running') {
      setStatus(task, 'completed', {
        canCancel: false,
        canPause: false,
        canRetry: false,
        progress: task.info.progress ? { ...task.info.progress, percent: 100 } : null
      })
    }
  } catch (error) {
    if (task.info.status === 'paused' || task.info.status === 'canceled') {
      // Status already set by pause/cancel.
    } else if (isAbortError(error)) {
      setStatus(task, 'canceled', { canCancel: false, canPause: false, canRetry: true })
    } else {
      const message = error instanceof Error ? error.message : String(error)
      setStatus(task, 'failed', { error: message, canCancel: false, canPause: false, canRetry: true })
    }
  } finally {
    task.controller = null
    activeCount--
    pump()
    // Task progress is transient UI: hide it once nothing else is downloading.
    if (activeCount === 0 && queue.length === 0) emitProgressDone()
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.message === 'TASK_ABORTED')
}

export function createAbortError(): Error {
  const error = new Error('TASK_ABORTED')
  error.name = 'AbortError'
  return error
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError()
}

export interface RunTaskOptions {
  label: string
  phase: ProgressPhase
  run: (ctx: { signal: AbortSignal; taskId: string; report: (progress: ProgressPayload) => void }) => Promise<void>
}

export function listTasks(): TaskInfo[] {
  return snapshot()
}

export function runTask(options: RunTaskOptions): string {
  const id = uid()
  const task: ManagedTask = {
    info: {
      id,
      label: options.label,
      phase: options.phase,
      status: 'queued',
      progress: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      canPause: false,
      canCancel: true,
      canRetry: false
    },
    action: async (signal) => {
      await options.run({
        signal,
        taskId: id,
        report: (progress) => updateTaskProgress(id, progress)
      })
    },
    controller: null
  }
  tasks.push(task)
  queue.push(id)
  publish()
  pump()
  return id
}

export function updateTaskProgress(id: string, progress: ProgressPayload): void {
  const task = getTask(id)
  if (!task) return
  if (task.info.status !== 'running') return
  const payload = { ...progress, taskId: id }
  task.info.progress = payload
  task.info.updatedAt = Date.now()
  emitProgress(payload)
  publish()
}

export function cancelTask(id: string): void {
  const task = getTask(id)
  if (!task) return
  if (task.info.status === 'queued') {
    const idx = queue.indexOf(id)
    if (idx >= 0) queue.splice(idx, 1)
    setStatus(task, 'canceled', { canCancel: false, canPause: false, canRetry: true })
    return
  }
  if (task.info.status === 'running') {
    setStatus(task, 'canceled', { canCancel: false, canPause: false, canRetry: true })
    task.controller?.abort(createAbortError())
  }
}

export function pauseTask(id: string): void {
  const task = getTask(id)
  if (!task || task.info.status !== 'running') return
  setStatus(task, 'paused', { canCancel: true, canPause: false, canRetry: true })
  task.controller?.abort(createAbortError())
}

export function resumeTask(id: string): void {
  const task = getTask(id)
  if (!task) return
  if (task.info.status !== 'paused' && task.info.status !== 'failed' && task.info.status !== 'canceled') return
  task.info.error = undefined
  task.info.status = 'queued'
  task.info.updatedAt = Date.now()
  task.info.canCancel = true
  task.info.canPause = false
  task.info.canRetry = false
  queue.push(id)
  publish()
  pump()
}

export function clearFinishedTasks(): void {
  for (let i = tasks.length - 1; i >= 0; i--) {
    const status = tasks[i].info.status
    if (status === 'completed' || status === 'failed' || status === 'canceled') {
      tasks.splice(i, 1)
    }
  }
  publish()
}

export function getTaskSignal(id?: string): AbortSignal | undefined {
  if (!id) return undefined
  return getTask(id)?.controller?.signal
}

export function runTaskAndWait<T>(options: {
  label: string
  phase: ProgressPhase
  run: (ctx: { signal: AbortSignal; taskId: string; report: (progress: ProgressPayload) => void }) => Promise<T>
}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = uid()
    const task: ManagedTask = {
      info: {
        id,
        label: options.label,
        phase: options.phase,
        status: 'queued',
        progress: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        canPause: false,
        canCancel: true,
        canRetry: false
      },
      action: async (signal) => {
        try {
          const result = await options.run({
            signal,
            taskId: id,
            report: (progress) => updateTaskProgress(id, progress)
          })
          if (task.info.status === 'running') {
            setStatus(task, 'completed', {
              canCancel: false,
              canPause: false,
              canRetry: false,
              progress: task.info.progress ? { ...task.info.progress, percent: 100 } : null
            })
          }
          resolve(result)
        } catch (error) {
          if (task.info.status === 'paused' || task.info.status === 'canceled') {
            reject(createAbortError())
          } else if (isAbortError(error)) {
            setStatus(task, 'canceled', { canCancel: false, canPause: false, canRetry: true })
            reject(createAbortError())
          } else {
            const message = error instanceof Error ? error.message : String(error)
            setStatus(task, 'failed', { error: message, canCancel: false, canPause: false, canRetry: true })
            reject(error)
          }
        }
      },
      controller: null
    }
    tasks.push(task)
    queue.push(id)
    publish()
    pump()
  })
}
