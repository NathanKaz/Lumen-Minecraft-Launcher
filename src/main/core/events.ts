import { BrowserWindow } from 'electron'
import { EVENTS } from '@shared/ipc'
import type { GameStatus, LogPayload, ProgressPayload, TaskInfo, ToastPayload } from '@shared/types'

const logs: LogPayload[] = []
const LOG_LIMIT = 800

function send(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

export function emitProgress(payload: ProgressPayload): void {
  send(EVENTS.progress, payload)
}

/** Signals that no more progress for the current operation will be reported. */
export function emitProgressDone(): void {
  send(EVENTS.progressDone, undefined)
}

export function emitLog(level: LogPayload['level'], message: string): void {
  const entry: LogPayload = { level, message, time: Date.now() }
  logs.push(entry)
  if (logs.length > LOG_LIMIT) logs.splice(0, logs.length - LOG_LIMIT)
  send(EVENTS.log, entry)
}

export function emitGameStatus(status: GameStatus): void {
  send(EVENTS.gameStatus, status)
}

export function emitToast(type: ToastPayload['type'], message: string): void {
  const payload: ToastPayload = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, message }
  send(EVENTS.toast, payload)
}

export function emitTasks(tasks: TaskInfo[]): void {
  send(EVENTS.tasks, tasks)
}

export function getLogs(): LogPayload[] {
  return [...logs]
}

export function clearLogs(): void {
  logs.length = 0
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}
