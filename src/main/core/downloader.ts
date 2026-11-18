import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'fs-extra'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { emitProgress } from './events'
import type { ProgressPhase } from '@shared/types'
import { USER_AGENT } from './http'

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

  let lastError: Error | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await fs.ensureDir(path.dirname(task.dest))
      const response = await fetch(task.url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(180000)
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${task.url}`)

      const total = Number(response.headers.get('content-length') ?? task.size ?? 0)
      const part = `${task.dest}.part`
      await fs.remove(part)

      let received = 0
      let lastEmit = 0
      const source = Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream)
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
      await pipeline(source, counter, fs.createWriteStream(part))
      onChunk(received, total)

      if (task.sha1) {
        const actual = await hashFile(part, 'sha1')
        if (actual !== task.sha1.toLowerCase()) {
          await fs.remove(part)
          throw new Error(`Контрольная сумма не совпала: ${task.label ?? path.basename(task.dest)}`)
        }
      }

      await fs.move(part, task.dest, { overwrite: true })
      return { bytes: received, skipped: false }
    } catch (error) {
      lastError = error as Error
      await fs.remove(`${task.dest}.part`)
    }
  }
  throw new Error(`Не удалось скачать ${task.label ?? path.basename(task.dest)}: ${lastError?.message ?? 'неизвестная ошибка'}`)
}

export async function downloadMany(
  tasks: DownloadTask[],
  phase: ProgressPhase,
  label: string,
  concurrency = 6
): Promise<void> {
  if (tasks.length === 0) return

  const expectedSizes = tasks.map((task) => task.size ?? 0)
  let downloaded = 0
  let completed = 0
  let activeBytes = 0
  const active = new Map<number, number>()
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
      message: `${label} · ${completed}/${tasks.length}`,
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
  const workerState = new Map<number, number>()
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
