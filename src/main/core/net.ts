import http, { type IncomingMessage } from 'node:http'
import { msg } from './i18n'
import https from 'node:https'
import { URL } from 'node:url'
import { emitLog } from './events'
import { APP_VERSION } from '@shared/version'

export const USER_AGENT = `LumenLauncher/${APP_VERSION} (+https://github.com/NathanKaz/Lumen-Minecraft-Launcher)`

// Общий агент с ограничением сокетов: Mojang CDN чувствителен к большим
// скачкам, поэтому параллельные запросы не должны открывать десятки соединений.
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 4 })
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 4 })

export interface NetworkResponse {
  response: IncomingMessage
  url: string
}

function describeError(error: unknown, url: string): string {
  const err = error as Error & { code?: string; cause?: unknown }
  const cause = err?.cause
  let detail = ''
  if (cause instanceof Error) detail = `: ${cause.message}`
  else if (cause) detail = `: ${String(cause)}`
  else if (err?.code) detail = `: ${err.code}`
  return `${err?.message ?? String(error)}${detail} [${url}]`
}

export function request(
  url: string,
  timeout = 30000,
  headers: Record<string, string> = {},
  redirectsLeft = 5,
  signal?: AbortSignal
): Promise<NetworkResponse> {
  const target = new URL(url)
  const isHttps = target.protocol === 'https:'
  const transport = isHttps ? https : http

  return new Promise<NetworkResponse>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('TASK_ABORTED'))
      return
    }

    const req = transport.get(
      target,
      {
        agent: isHttps ? httpsAgent : httpAgent,
        headers: { 'User-Agent': USER_AGENT, ...headers }
      },
      (response) => {
        const status = response.statusCode ?? 0

        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume()
          if (redirectsLeft <= 0) {
            reject(new Error(msg('Слишком много перенаправлений: {url}', { url })))
            return
          }
          const next = new URL(response.headers.location, target).toString()
          request(next, timeout, headers, redirectsLeft - 1, signal).then(resolve, reject)
          return
        }

        if (status < 200 || status >= 300) {
          response.resume()
          reject(new Error(msg('HTTP {status} при запросе {url}', { status, url: target.toString() })))
          return
        }

        resolve({ response, url: target.toString() })
      }
    )

    const onAbort = () => {
      const error = new Error('TASK_ABORTED')
      error.name = 'AbortError'
      req.destroy(error)
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    req.setTimeout(timeout, () => {
      req.destroy(new Error(msg('Таймаут подключения {seconds} с', { seconds: Math.round(timeout / 1000) })))
    })
    req.on('error', (error) => {
      signal?.removeEventListener('abort', onAbort)
      reject(error.name === 'AbortError' ? error : new Error(describeError(error, target.toString())))
    })
    req.on('close', () => signal?.removeEventListener('abort', onAbort))
  })
}

export async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3, signal?: AbortSignal): Promise<T> {
  let lastError: Error | undefined
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) {
      const err = new Error('TASK_ABORTED')
      err.name = 'AbortError'
      throw err
    }
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (lastError.name === 'AbortError' || signal?.aborted) throw lastError
      emitLog('warn', msg('{label} · попытка {attempt}/{attempts} не удалась: {error}', {
        label, attempt, attempts, error: lastError.message
      }))
      if (attempt < attempts) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, 500 * attempt)
          const onAbort = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); const err = new Error('TASK_ABORTED'); err.name = 'AbortError'; reject(err) }
          signal?.addEventListener('abort', onAbort, { once: true })
        })
      }
    }
  }
  throw new Error(msg('{label}: {error}', { label, error: lastError?.message ?? msg("неизвестная ошибка") }))
}

export async function requestText(url: string, timeout = 30000, headers: Record<string, string> = {}): Promise<string> {
  return withRetry(msg('Запрос {url}', { url }), async () => {
    const { response } = await request(url, timeout, { Accept: 'application/json', ...headers })
    const chunks: Buffer[] = []
    for await (const chunk of response) chunks.push(Buffer.from(chunk))
    return Buffer.concat(chunks).toString('utf8')
  })
}
