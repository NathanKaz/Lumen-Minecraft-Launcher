import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'fs-extra'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { emitProgress } from './events'
import { msg } from './i18n'
import { request, withRetry } from './net'
import type { ProgressPhase } from '@shared/types'

export interface DownloadTask {
  url: string
  dest: string
  sha1?: string
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
  if (!task.sha1) return fs.statSync(task.dest).size > 0
  try {
    return (await hashFile(task.dest, 'sha1')) === task.sha1.toLowerCase()
  } catch {
    return false
  }
}

async function downloadOne(task: DownloadTask, onChunk: (bytes: number, total: number) => void): Promise<DownloadResult> {
  if (await fileMatches(task)) {
    return { bytes: task.size ?? fs.statSync(task.dest).size, skipped: true }
  }

  const label = task.label ?? path.basename(task.dest)
  const part = `${task.dest}.part`

  return withRetry(msg('Не удалось скачать {label}', { label }), async () => {
    await fs.ensureDir(path.dirname(task.dest))
    await fs.remove(part)

    const { response } = await request(task.url, READ_TIMEOUT)
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

      if (task.sha1) {
        const actual = await hashFile(part, 'sha1')
        if (actual !== task.sha1.toLowerCase()) {
          throw new Error(msg('Контрольная сумма не совпала: {label}', { label }))
        }
      }

      await fs.move(part, task.dest, { overwrite: true })
      return { bytes: received, skipped: false }
    } catch (error) {
      await fs.remove(part)
      throw error
    }
  }, 3)
}

export async function downloadMany(
  tasks: DownloadTask[],
  phase: ProgressPhase,
  label: string,
  concurrency = 4
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
    emitProgress({
      phase,
      message: msg('{label} · {current}/{total}', { label, current: completed, total: tasks.length }),
      percent: totalBytes > 0 ? Math.min(100, ((downloaded + activeBytes) / totalBytes) * 100) : 0,
      current: completed,
      total: tasks.length,
      bytes: downloaded + activeBytes,
      totalBytes,
      speed
    })
    lastEmit = now
  }

  let cursor = 0
  const worker = async () => {
    while (cursor < tasks.length) {
      const index = cursor++
      const task = tasks[index]
      const result = await downloadOne(task, (received, total) => {
        if (expectedSizes[index] === 0 && total > 0) expectedSizes[index] = total
        active.set(index, received)
        activeBytes = [...active.values()].reduce((sum, value) => sum + value, 0)
        windowBytes += received - (workerState.get(index) ?? 0)
        workerState.set(index, received)
        report()
      })
      active.delete(index)
      workerState.delete(index)
      activeBytes = [...active.values()].reduce((sum, value) => sum + value, 0)
      downloaded += result.bytes
      completed++
      report(true)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()))
  report(true)
}

export async function downloadToFile(
  url: string,
  dest: string,
  phase: ProgressPhase,
  label: string,
  sha1?: string
): Promise<void> {
  await downloadMany([{ url, dest, sha1, label }], phase, label, 1)
}
