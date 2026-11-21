import http, { type IncomingHttpHeaders } from 'node:http'
import https from 'node:https'
import crypto from 'node:crypto'
import path from 'node:path'
import { safeStorage, shell } from 'electron'
import fs from 'fs-extra'
import type { AppState, MicrosoftCredentials } from '@shared/types'
import { msg } from './i18n'
import { root } from './paths'
import { emitLog } from './events'
import {
  addMicrosoftAccount,
  getState,
  signOutMicrosoftAccount,
  updateMicrosoftAccount
} from './store'

// Microsoft identity platform (consumer accounts only), Xbox Live and Minecraft.
const AUTH_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize'
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
const XBL_URL = 'https://user.auth.xboxlive.com/user/authenticate'
const XSTS_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize'
const MC_AUTH_URL = 'https://api.minecraftservices.com/authentication/login_with_xbox'
const MC_PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile'
const MSA_SCOPE = 'openid profile offline_access XboxLive.signin'
const USER_AGENT = 'LumenLauncher/1.2.0 (Microsoft sign-in)'

const tokensPath = path.join(root, 'msa-tokens.json')
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000

interface HttpResult {
  status: number
  text: string
  headers: IncomingHttpHeaders
}

interface MsaTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface XboxResponse {
  Token?: string
  DisplayClaims?: { xui?: Array<{ uhs?: string; xid?: string }> }
  XErr?: number
  Message?: string
  error?: string
  error_description?: string
}

interface McAuthResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface McProfileResponse {
  id?: string
  name?: string
  error?: string
  errorMessage?: string
}

interface MinecraftSession extends Omit<MicrosoftCredentials, 'refreshToken'> {}

function request(url: string, method: 'GET' | 'POST', headers: Record<string, string>, body?: string): Promise<HttpResult> {
  const target = new URL(url)
  const transport = target.protocol === 'https:' ? https : http
  return new Promise<HttpResult>((resolve, reject) => {
    const req = transport.request(target, {
      method,
      timeout: 30000,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers }
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        text: Buffer.concat(chunks).toString('utf8'),
        headers: response.headers
      }))
    })
    req.on('timeout', () => req.destroy(new Error(msg('Таймаут подключения {seconds} с', { seconds: 30 }))))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function parseJson<T>(result: HttpResult, url: string): T {
  try {
    return JSON.parse(result.text) as T
  } catch (error) {
    throw new Error(msg('Неверный JSON в ответе {url}: {error}', { url, error: (error as Error).message }))
  }
}

function describeError(payload: { error?: string; error_description?: string; Message?: string }, status: number): string {
  return payload.error_description || payload.error || payload.Message || `HTTP ${status}`
}

async function postForm(url: string, params: Record<string, string>): Promise<{ result: HttpResult; payload: MsaTokenResponse }> {
  const body = new URLSearchParams(params).toString()
  const result = await request(url, 'POST', { 'Content-Type': 'application/x-www-form-urlencoded' }, body)
  return { result, payload: parseJson<MsaTokenResponse>(result, url) }
}

async function postJson<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<{ result: HttpResult; payload: T }> {
  const result = await request(url, 'POST', { 'Content-Type': 'application/json', ...headers }, JSON.stringify(body))
  return { result, payload: parseJson<T>(result, url) }
}

function formatUuid(id: string): string {
  const hex = id.replace(/-/g, '').toLowerCase()
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Refresh tokens are long-lived, so they are encrypted with the OS keychain when available. */
function readTokenStore(): Record<string, string> {
  try {
    return fs.existsSync(tokensPath) ? fs.readJsonSync(tokensPath) as Record<string, string> : {}
  } catch {
    return {}
  }
}

function sealToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) return `raw:${token}`
  return `enc:${safeStorage.encryptString(token).toString('base64')}`
}

function unsealToken(value: string): string {
  if (value.startsWith('enc:')) {
    return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'))
  }
  return value.startsWith('raw:') ? value.slice(4) : value
}

function writeTokenStore(tokens: Record<string, string>): void {
  const temp = `${tokensPath}.tmp`
  fs.writeJsonSync(temp, tokens, { spaces: 2 })
  fs.renameSync(temp, tokensPath)
  try {
    fs.chmodSync(tokensPath, 0o600)
  } catch {
    // Windows ignores POSIX permissions; the file is still encrypted when possible.
  }
}

function saveRefreshToken(accountId: string, token: string): void {
  const tokens = readTokenStore()
  tokens[accountId] = sealToken(token)
  writeTokenStore(tokens)
}

function loadRefreshToken(accountId: string): string | undefined {
  const value = readTokenStore()[accountId]
  if (!value) return undefined
  try {
    return unsealToken(value)
  } catch (error) {
    emitLog('error', msg('Не удалось прочитать токен Microsoft: {error}', { error: (error as Error).message }))
    return undefined
  }
}

function forgetRefreshToken(accountId: string): void {
  const tokens = readTokenStore()
  if (!(accountId in tokens)) return
  delete tokens[accountId]
  writeTokenStore(tokens)
}

function clientId(): string {
  const id = getState().settings.msaClientId?.trim() ?? ''
  if (!id) throw new Error(msg('Укажите Client ID приложения Azure в настройках лаунчера.'))
  return id
}

function xstsError(code: number): Error {
  const text = code === 2148916233
    ? msg('У этой учётной записи нет Xbox Live профиля. Войдите в Minecraft на сайте minecraft.net.')
    : code === 2148916235
      ? msg('Xbox Live недоступен в вашем регионе.')
      : code === 2148916238
        ? msg('Аккаунт требует подтверждения семьи в Xbox.')
        : code === 2148916227
          ? msg('Аккаунт Xbox заблокирован.')
          : msg('Не удалось получить Xbox Live токен (код {code}).', { code })
  return new Error(text)
}

async function authenticateXbox(accessToken: string): Promise<{ token: string; userHash?: string; xuid?: string }> {
  const { result, payload } = await postJson<XboxResponse>(XBL_URL, {
    Properties: {
      AuthMethod: 'RPS',
      SiteName: 'user.auth.xboxlive.com',
      RpsTicket: `d=${accessToken}`
    },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT'
  }, { 'x-xbl-contract-version': '2' })

  if (result.status < 200 || result.status >= 300 || !payload.Token) {
    throw xstsError(payload.XErr ?? result.status)
  }
  const xui = payload.DisplayClaims?.xui?.[0]
  return { token: payload.Token, userHash: xui?.uhs, xuid: xui?.xid }
}

async function authorizeXsts(xblToken: string): Promise<{ token: string; userHash?: string; xuid?: string }> {
  const { result, payload } = await postJson<XboxResponse>(XSTS_URL, {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT'
  }, { 'x-xbl-contract-version': '2' })

  if (result.status < 200 || result.status >= 300 || !payload.Token) {
    if (payload.XErr) throw xstsError(payload.XErr)
    throw new Error(msg('Не удалось получить Xbox Live токен (код {code}).', { code: result.status }))
  }
  const xui = payload.DisplayClaims?.xui?.[0]
  return { token: payload.Token, userHash: xui?.uhs, xuid: xui?.xid }
}

async function authenticateMinecraft(userHash: string, xstsToken: string): Promise<{ token: string; expiresAt: number }> {
  const url = MC_AUTH_URL
  const { result, payload } = await postJson<McAuthResponse>(url, {
    identityToken: `XBL3.0 x=${userHash};${xstsToken}`
  })
  if (result.status === 403) throw new Error(msg('Приложение Azure не имеет доступа к API Minecraft. Подайте заявку: https://aka.ms/mce-reviewappid'))
  if (result.status < 200 || result.status >= 300 || !payload.access_token) {
    throw new Error(msg('Не удалось получить токен Minecraft: {error}', {
      error: describeError(payload, result.status)
    }))
  }
  return {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 86400) * 1000
  }
}

async function loadMinecraftProfile(accessToken: string): Promise<{ name: string; uuid: string }> {
  const url = MC_PROFILE_URL
  const result = await request(url, 'GET', { Authorization: `Bearer ${accessToken}` })
  const payload = parseJson<McProfileResponse>(result, url)
  if (result.status === 403) throw new Error(msg('Приложение Azure не имеет доступа к API Minecraft. Подайте заявку: https://aka.ms/mce-reviewappid'))
  if (result.status !== 200 || !payload.id || !payload.name) {
    throw new Error(msg('У учётной записи нет профиля Minecraft. Убедитесь, что игра приобретена и выполнен вход на minecraft.net.'))
  }
  return { name: payload.name, uuid: formatUuid(payload.id) }
}

async function completeMinecraftAuth(msaAccessToken: string): Promise<MinecraftSession> {
  const xbl = await authenticateXbox(msaAccessToken)
  const xsts = await authorizeXsts(xbl.token)
  const userHash = xsts.userHash ?? xbl.userHash
  if (!userHash) throw new Error(msg('Не удалось получить Xbox Live токен (код {code}).', { code: 0 }))
  const mc = await authenticateMinecraft(userHash, xsts.token)
  const profile = await loadMinecraftProfile(mc.token)
  return {
    ...profile,
    token: mc.token,
    expiresAt: mc.expiresAt,
    xuid: xsts.xuid ?? xbl.xuid,
    userHash
  }
}

function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<MsaTokenResponse> {
  return postForm(TOKEN_URL, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId(),
    code_verifier: verifier,
    scope: MSA_SCOPE
  }).then(({ result, payload }) => {
    if (result.status < 200 || result.status >= 300 || !payload.access_token) {
      throw new Error(msg('Не удалось получить Access Token Microsoft: {error}', {
        error: describeError(payload, result.status)
      }))
    }
    return payload
  })
}

function exchangeRefreshToken(refreshToken: string): Promise<MsaTokenResponse> {
  return postForm(TOKEN_URL, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId(),
    scope: MSA_SCOPE
  }).then(({ result, payload }) => {
    if (result.status < 200 || result.status >= 300 || !payload.access_token) {
      const expired = payload.error === 'invalid_grant'
      throw new Error(expired
        ? msg('Срок действия входа истёк. Войдите через Microsoft снова.')
        : msg('Не удалось получить Access Token Microsoft: {error}', {
          error: describeError(payload, result.status)
        }))
    }
    return payload
  })
}

function callbackPage(success: boolean): string {
  const title = success ? 'Microsoft · Lumen Launcher' : 'Microsoft · error'
  const text = success
    ? 'Sign-in complete. You can close this tab.'
    : 'Sign-in failed. You can close this tab and try again.'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
    <style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#0B0E14;color:#e2e8f0;
    font:14px/1.5 system-ui,sans-serif;text-align:center;padding:24px}h1{font-size:18px;color:#6ee7b7}</style>
    </head><body><div><h1>Lumen Launcher</h1><p>${text}</p></div></body></html>`
}

/** Runs PKCE authorization-code sign-in in the system browser. */
export async function loginMicrosoft(): Promise<AppState> {
  const id = clientId()
  const verifier = crypto.randomBytes(48).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const state = crypto.randomBytes(16).toString('hex')

  const server = http.createServer()
  let settle!: { resolve: (value: { code: string; port: number }) => void; reject: (error: Error) => void }
  const pending = new Promise<{ code: string; port: number }>((resolve, reject) => { settle = { resolve, reject } })
  const timer = setTimeout(() => {
    settle.reject(new Error(msg('Время ожидания входа через Microsoft истекло.')))
  }, LOGIN_TIMEOUT_MS)

  server.on('request', (req, res) => {
    const incoming = new URL(req.url ?? '/', 'http://localhost')
    const error = incoming.searchParams.get('error')
    const receivedState = incoming.searchParams.get('state')
    const authCode = incoming.searchParams.get('code')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(callbackPage(!error && Boolean(authCode)))
    if (error) {
      settle.reject(new Error(msg('Ошибка авторизации Microsoft: {error}', {
        error: incoming.searchParams.get('error_description') ?? error
      })))
    } else if (!authCode || receivedState !== state) {
      settle.reject(new Error(msg('Неверное состояние запроса входа. Попробуйте ещё раз.')))
    } else {
      settle.resolve({ code: authCode, port: (server.address() as { port: number }).port })
    }
  })
  server.on('error', (error) => settle.reject(error))

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  if (!port) {
    clearTimeout(timer)
    server.close()
    throw new Error(msg('Не удалось запустить локальный сервер для входа через Microsoft'))
  }

  const redirectUri = `http://localhost:${port}`
  const params = new URLSearchParams({
    client_id: id,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: MSA_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  })
  const authUrl = `${AUTH_URL}?${params.toString()}`

  try {
    emitLog('info', msg('Откройте браузер и завершите вход в Microsoft.'))
    await shell.openExternal(authUrl)
    const { code } = await pending
    const tokens = await exchangeCode(code, verifier, redirectUri)
    const session = await completeMinecraftAuth(tokens.access_token!)
    if (!tokens.refresh_token) throw new Error(msg('Срок действия входа истёк. Войдите через Microsoft снова.'))
    const credentials: MicrosoftCredentials = { ...session, refreshToken: tokens.refresh_token }
    const next = addMicrosoftAccount(credentials)
    saveRefreshToken(next.account.id, credentials.refreshToken)
    emitLog('info', msg('Профиль Microsoft добавлен'))
    return next
  } finally {
    clearTimeout(timer)
    server.close()
  }
}

/** Silently refreshes a Microsoft account's Minecraft access token. */
export async function refreshMicrosoft(id?: string): Promise<AppState> {
  const current = getState()
  const account = id ? current.accounts.find((entry) => entry.id === id) : current.account
  if (!account || account.type !== 'microsoft') {
    throw new Error(msg('Войдите через Microsoft, чтобы обновить токен.'))
  }
  const refreshToken = loadRefreshToken(account.id)
  if (!refreshToken) throw new Error(msg('Токен обновления не найден. Войдите через Microsoft снова.'))

  const tokens = await exchangeRefreshToken(refreshToken)
  const session = await completeMinecraftAuth(tokens.access_token!)
  const next = updateMicrosoftAccount(account.id, session)
  saveRefreshToken(account.id, tokens.refresh_token ?? refreshToken)
  emitLog('info', msg('Токен Microsoft обновлён'))
  return next
}

/** Removes a stored refresh token when the whole account record is deleted. */
export function forgetMicrosoftToken(id: string): void {
  forgetRefreshToken(id)
}

/** Drops the refresh token and keeps the installed instances under an offline profile. */
export async function logoutMicrosoft(id: string): Promise<AppState> {
  const account = getState().accounts.find((entry) => entry.id === id)
  if (!account || account.type !== 'microsoft') throw new Error(msg('Профиль не найден'))
  forgetRefreshToken(id)
  const next = signOutMicrosoftAccount(id)
  emitLog('info', msg('Выполнен выход из Microsoft'))
  return next
}

/** Called before launch so an expired Minecraft token never reaches the game. */
export async function ensureFreshMicrosoftToken(): Promise<void> {
  const account = getState().account
  if (account.type !== 'microsoft') return
  if ((account.expiresAt ?? 0) > Date.now() + 5 * 60 * 1000) return
  emitLog('info', msg('Обновление токена Microsoft...'))
  await refreshMicrosoft(account.id)
}
