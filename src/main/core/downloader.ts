import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'fs-extra'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { emitProgress } from './events'
import { msg } from './i18n'
import { request, withRetry } from './net'
import { updateTaskProgress } from './tasks'
import type { ProgressPayload, ProgressPhase } from '@shared/types'

export interface DownloadTask {
  url: string
  dest: string
  sha1?: string
  /** SHA-256 digest (hex) for release artifacts that publish one. */
  sha256?: string
  size?: number
  label?: string
}

interface DownloadResult {
  bytes: number
  skipped: boolean
}

const READ_TIMEOUT = 180000

function hashFile(file: string, algorithm: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm)
    const stream = fs.createReadStream(file)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

async function fileMatches(task: DownloadTask): Promise<boolean> {
  if (!fs.existsSync(task.dest)) return false
  if (!task.sha1 && !task.sha256) return fs.statSync(task.dest).size > 0
  try {
    if (task.sha256 && (await hashFile(task.dest, 'sha256')) !== task.sha256.toLowerCase()) return false
    if (task.sha1 && (await hashFile(task.dest, 'sha1')) !== task.sha1.toLowerCase()) return false
    return true
  } catch {
    return false
  }
}

async function downloadOne(task: DownloadTask, onChunk: (bytes: number, total: number) => void, signal?: AbortSignal): Promise<DownloadResult> {
  if (signal?.aborted) throw Object.assign(new Error('TASK_ABORTED'), { name: 'AbortError' })
  if (await fileMatches(task)) {
    return { bytes: task.size ?? fs.statSync(task.dest).size, skipped: true }
  }

  const label = task.label ?? path.basename(task.dest)
  const part = `${task.dest}.part`

  return withRetry(msg('Не удалось скачать {label}', { label }), async () => {
    if (signal?.aborted) throw Object.assign(new Error('TASK_ABORTED'), { name: 'AbortError' })
    await fs.ensureDir(path.dirname(task.dest))
    await fs.remove(part)

    const { response } = await request(task.url, READ_TIMEOUT, {}, 5, signal)
    // Защита от «зависшего» соединения после получения заголовков.
    response.setTimeout(READ_TIMEOUT, () => {
      response.destroy(new Error(msg('Таймаут чтения {seconds} с', { seconds: Math.round(READ_TIMEOUT / 1000) })))
    })

    const headerSize = Number(response.headers['content-length'] ?? 0)
    const total = Number.isFinite(headerSize) && headerSize > 0 ? headerSize : (task.size ?? 0)

    let received = 0
    let lastEmit = 0
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        if (signal?.aborted) {
          callback(Object.assign(new Error('TASK_ABORTED'), { name: 'AbortError' }))
          return
        }
        received += chunk.length
        const now = Date.now()
        if (now - lastEmit > 90) {
          lastEmit = now
          onChunk(received, total)
        }
        callback(null, chunk)
      }
    })

    try {
      await pipeline(response, counter, fs.createWriteStream(part))
      onChunk(received, total)

      if (task.sha1 && (await hashFile(part, 'sha1')) !== task.sha1.toLowerCase()) {
        throw new Error(msg('Контрольная сумма не совпала: {label}', { label }))
      }
      if (task.sha256 && (await hashFile(part, 'sha256')) !== task.sha256.toLowerCase()) {
        throw new Error(msg('Контрольная сумма не совпала: {label}', { label }))
      }

      await fs.move(part, task.dest, { overwrite: true })
      return { bytes: received, skipped: false }
    } catch (error) {
      await fs.remove(part)
      throw error
    }
  }, 3, signal)
}

export async function downloadMany(
  tasks: DownloadTask[],
  phase: ProgressPhase,
  label: string,
  concurrency = 4,
  opts?: { signal?: AbortSignal; taskId?: string }
): Promise<void> {
  if (tasks.length === 0) return

  const expectedSizes = tasks.map((task) => task.size ?? 0)
  let downloaded = 0
  let completed = 0
  let activeBytes = 0
  const active = new Map<number, number>()
  const workerState = new Map<number, number>()
  let lastEmit = 0
  let windowBytes = 0
  let windowTime = Date.now()
  let speed = 0

  const report = (force = false) => {
    const now = Date.now()
    if (!force && now - lastEmit < 110) return
    const dt = (now - windowTime) / 1000
    if (dt > 0.15) {
      speed = windowBytes / dt
      windowBytes = 0
      windowTime = now
    }
    const totalBytes = expectedSizes.reduce((sum, value) => sum + value, 0)
    const payload: ProgressPayload = {
      phase,
      message: msg('{label} · {current}/{total}', { label, current: completed, total: tasks.length }),
      percent: totalBytes > 0 ? Math.min(100, ((downloaded + activeBytes) / totalBytes) * 100) : 0,
      current: completed,
      total: tasks.length,
      bytes: downloaded + activeBytes,
      totalBytes,
      speed,
      taskId: opts?.taskId
    }
    if (opts?.taskId) updateTaskProgress(opts.taskId, payload)
    else emitProgress(payload)
    lastEmit = now
  }

  let cursor = 0
  let abortedError: Error | null = null
  const worker = async () => {
    while (cursor < tasks.length) {
      if (opts?.signal?.aborted) {
        abortedError = abortedError ?? Object.assign(new Error('TASK_ABORTED'), { name: 'AbortError' })
        return
      }
      const index = cursor++
      const task = tasks[index]
      try {
        const result = await downloadOne(task, (received, total) => {
          if (expectedSizes[index] === 0 && total > 0) expectedSizes[index] = total
          active.set(index, received)
          activeBytes = [...active.values()].reduce((sum, value) => sum + value, 0)
          windowBytes += received - (workerState.get(index) ?? 0)
          workerState.set(index, received)
          report()
        }, opts?.signal)
        active.delete(index)
        workerState.delete(index)
        activeBytes = [...active.values()].reduce((sum, value) => sum + value, 0)
        downloaded += result.bytes
        completed++
        report(true)
      } catch (error) {
        if ((error as Error).name === 'AbortError' || opts?.signal?.aborted) {
          abortedError = abortedError ?? (error as Error)
          return
        }
        throw error
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()))
  if (abortedError) throw abortedError
  report(true)
}

export async function downloadToFile(
  url: string,
  dest: string,
  phase: ProgressPhase,
  label: string,
  sha1?: string,
  opts?: { signal?: AbortSignal; taskId?: string },
  sha256?: string
): Promise<void> {
  await downloadMany([{ url, dest, sha1, sha256, label }], phase, label, 1, opts)
}
