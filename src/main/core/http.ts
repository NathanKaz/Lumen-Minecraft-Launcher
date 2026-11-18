export const USER_AGENT = 'NeonLauncher/1.0.0 (+https://github.com/NathanKaz/Minecraft-launcher)'

export async function fetchJson<T>(url: string, timeout = 30000): Promise<T> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeout)
  })
  if (!response.ok) {
    throw new Error(`Запрос ${url} завершился с кодом ${response.status}`)
  }
  return (await response.json()) as T
}

export async function fetchText(url: string, timeout = 30000): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeout)
  })
  if (!response.ok) throw new Error(`Запрос ${url} завершился с кодом ${response.status}`)
  return response.text()
}
