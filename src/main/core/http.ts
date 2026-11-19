import { msg } from './i18n'
import { requestText } from './net'

export { USER_AGENT } from './net'

export async function fetchJson<T>(url: string, timeout = 30000): Promise<T> {
  const text = await requestText(url, timeout)
  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new Error(msg('Неверный JSON в ответе {url}: {error}', { url, error: (error as Error).message }))
  }
}

export async function fetchText(url: string, timeout = 30000): Promise<string> {
  return requestText(url, timeout)
}
