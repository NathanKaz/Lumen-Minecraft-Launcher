import path from 'node:path'
import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import { dialog } from 'electron'
import { msg } from './i18n'
import { accountSkinDir as accountSkinPath, dirs, instanceDir, packsDir } from './paths'
import { getState, setState } from './store'
import { emitLog, emitToast, uid } from './events'
import type { SkinInfo, SkinModel } from '@shared/types'

interface StoredSkin {
  id: string
  name: string
  model: SkinModel
  fileName: string
  size: number
  addedAt: number
}

const packFileName = 'lumen-skin.zip'
const migrationMarker = path.join(dirs.skins, '.lumen-skins-migrated')

/** Each offline player has an isolated skin library. */
function accountSkinDir(): string {
  const state = getState()
  return accountSkinPath(state.activeAccountId || state.account.id)
}

function libraryPath(): string {
  return path.join(accountSkinDir(), 'library.json')
}

/** Moves a pre-multi-account library into the original player's folder once. */
async function ensureMigrated(): Promise<void> {
  const dir = accountSkinDir()
  await fs.ensureDir(dir)
  if (await fs.pathExists(libraryPath())) return
  if (await fs.pathExists(migrationMarker)) return

  const state = getState()
  const originalAccountId = state.accounts?.[0]?.id || state.activeAccountId || state.account.id
  if (path.basename(dir) !== originalAccountId) return

  const legacy = path.join(dirs.skins, 'library.json')
  if (!(await fs.pathExists(legacy))) return
  try {
    const skins = await fs.readJson(legacy) as StoredSkin[]
    for (const skin of skins) {
      const source = path.join(dirs.skins, skin.fileName)
      if (await fs.pathExists(source)) await fs.copy(source, path.join(dir, skin.fileName))
    }
    await fs.writeJson(libraryPath(), skins, { spaces: 2 })
    await fs.writeJson(migrationMarker, { migratedAt: Date.now(), accountId: originalAccountId }, { spaces: 2 })
  } catch {
    // A corrupt legacy library is simply ignored.
  }
}

async function readLibrary(): Promise<StoredSkin[]> {
  await ensureMigrated()
  try {
    return await fs.readJson(libraryPath()) as StoredSkin[]
  } catch {
    return []
  }
}

async function writeLibrary(skins: StoredSkin[]): Promise<void> {
  await ensureMigrated()
  await fs.ensureDir(accountSkinDir())
  await fs.writeJson(libraryPath(), skins, { spaces: 2 })
}

function skinDimensions(file: string): { width: number; height: number } | null {
  const fd = fs.openSync(file, 'r')
  try {
    const buffer = Buffer.alloc(24)
    const read = fs.readSync(fd, buffer, 0, 24, 0)
    if (read < 24) return null
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    if (!buffer.subarray(0, 8).equals(signature)) return null
    if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  } finally {
    fs.closeSync(fd)
  }
}

function toInfo(skin: StoredSkin, activeId?: string): SkinInfo {
  const filePath = path.join(accountSkinDir(), skin.fileName)
  const base64 = fs.existsSync(filePath) ? fs.readFileSync(filePath).toString('base64') : ''
  return {
    id: skin.id,
    name: skin.name,
    model: skin.model,
    dataUrl: base64 ? `data:image/png;base64,${base64}` : '',
    size: skin.size,
    addedAt: skin.addedAt,
    active: skin.id === activeId
  }
}

export async function listSkins(): Promise<SkinInfo[]> {
  const activeId = getState()?.settings.activeSkinId
  const skins = await readLibrary()
  return skins.map((skin) => toInfo(skin, activeId)).sort((a, b) => b.addedAt - a.addedAt)
}

export async function importSkin(): Promise<SkinInfo | null> {
  const result = await dialog.showOpenDialog({
    title: msg('Выберите файл скина'),
    filters: [
      { name: msg('Файлы PNG'), extensions: ['png'] },
      { name: msg('Все файлы'), extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths[0]) return null

  const source = result.filePaths[0]
  const dimensions = skinDimensions(source)
  if (!dimensions || !((dimensions.width === 64 && dimensions.height === 64) || (dimensions.width === 64 && dimensions.height === 32))) {
    throw new Error(msg('Недопустимый файл скина: нужен PNG 64×64 или 64×32.'))
  }

  await ensureMigrated()
  const id = uid()
  const fileName = `${id}.png`
  const stats = await fs.stat(source)
  await fs.copy(source, path.join(accountSkinDir(), fileName))
  const skin: StoredSkin = {
    id,
    name: path.basename(source, path.extname(source)),
    model: 'wide',
    fileName,
    size: stats.size,
    addedAt: Date.now()
  }
  await writeLibrary([...(await readLibrary()), skin])
  emitToast('success', msg('Скин загружен'))
  emitLog('info', msg('Скин загружен') + `: ${skin.name}`)
  return toInfo(skin, getState()?.settings.activeSkinId)
}

export async function deleteSkin(id: string): Promise<void> {
  const skins = await readLibrary()
  const skin = skins.find((entry) => entry.id === id)
  if (!skin) return
  await fs.remove(path.join(accountSkinDir(), skin.fileName))
  await writeLibrary(skins.filter((entry) => entry.id !== id))
  const settings = getState().settings
  if (settings.activeSkinId === id) {
    setState({ settings: { ...settings, activeSkinId: undefined } })
  }
  emitToast('success', msg('Скин удалён'))
}

export async function selectSkin(id: string | null): Promise<void> {
  const settings = getState().settings
  setState({ settings: { ...settings, activeSkinId: id ?? undefined } })
  if (id) emitToast('success', msg('Скин выбран'))
}

export async function setSkinModel(id: string, model: SkinModel): Promise<void> {
  const skins = await readLibrary()
  const skin = skins.find((entry) => entry.id === id)
  if (!skin || skin.model === model) return
  skin.model = model
  await writeLibrary(skins)
  emitToast('success', msg('Модель скина обновлена'))
}

const DEFAULT_SKIN_NAMES = ['alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'steve', 'sunny', 'zuri'] as const

function parseJsonStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/** Generates a resource pack that overrides the local player texture. */
export async function applySkinResourcePack(profileId: string): Promise<void> {
  const activeId = getState()?.settings.activeSkinId
  const skin = activeId ? (await readLibrary()).find((entry) => entry.id === activeId) : undefined
  const targetDir = packsDir(profileId, 'resource')
  await fs.ensureDir(targetDir)
  const target = path.join(targetDir, packFileName)

  if (!skin || !(await fs.pathExists(path.join(accountSkinDir(), skin.fileName)))) {
    if (await fs.pathExists(target)) await fs.remove(target)
    await setPackEnabled(profileId, 'resource', packFileName, false)
    return
  }

  const texture = await fs.readFile(path.join(accountSkinDir(), skin.fileName))
  const zip = new AdmZip()
  zip.addFile('pack.mcmeta', Buffer.from(JSON.stringify({
    pack: {
      // Keep both old and new metadata keys for broad MC compatibility.
      pack_format: 15,
      supported_formats: [15, 999],
      min_format: [15, 0],
      max_format: [999, 0],
      description: 'Lumen Launcher skin'
    }
  }, null, 2)))
  // 1.20.2+ assigns offline players one of 9 default skins; override all of them.
  // Legacy steve/alex paths are kept for older versions.
  for (const model of ['wide', 'slim']) {
    for (const name of DEFAULT_SKIN_NAMES) {
      zip.addFile(`assets/minecraft/textures/entity/player/${model}/${name}.png`, texture)
    }
  }
  zip.addFile('assets/minecraft/textures/entity/steve.png', texture)
  zip.addFile('assets/minecraft/textures/entity/alex.png', texture)
  await fs.writeFile(target, zip.toBuffer())
  await setPackEnabled(profileId, 'resource', packFileName, true)
  emitLog('info', msg('Скин применён к сборке') + `: ${profileId}`)
}

/** Keeps our generated pack in sync with the `resourcePacks` entry in options.txt. */
export async function setPackEnabled(profileId: string, kind: 'resource' | 'shader', fileName: string, enabled: boolean): Promise<void> {
  const optionsPath = path.join(instanceDir(profileId), 'options.txt')
  if (!(await fs.pathExists(optionsPath))) {
    if (!enabled) return
    const line = kind === 'resource'
      ? `resourcePacks:${JSON.stringify(['vanilla', `file/${fileName}`])}`
      : `shaderPack:${fileName}`
    await fs.writeFile(optionsPath, `${line}\n`)
    return
  }
  const lines = (await fs.readFile(optionsPath, 'utf8')).split(/\r?\n/)
  if (kind === 'resource') {
    const key = 'resourcePacks:'
    const incompatibleKey = 'incompatibleResourcePacks:'
    const index = lines.findIndex((line) => line.startsWith(key))
    let packs = index >= 0 ? parseJsonStringArray(lines[index].slice(key.length)) : ['vanilla']
    const entry = `file/${fileName}`
    packs = packs.filter((item) => item !== entry)
    if (enabled) {
      if (!packs.includes('vanilla')) packs.unshift('vanilla')
      packs.push(entry) // highest priority in MC resource pack order
    }
    const updated = `${key}${JSON.stringify(packs)}`
    if (index >= 0) lines[index] = updated
    else lines.push(updated)

    const incompatibleIndex = lines.findIndex((line) => line.startsWith(incompatibleKey))
    if (incompatibleIndex >= 0) {
      const incompatible = parseJsonStringArray(lines[incompatibleIndex].slice(incompatibleKey.length))
        .filter((item) => item !== entry)
      lines[incompatibleIndex] = `${incompatibleKey}${JSON.stringify(incompatible)}`
    }
  } else {
    const key = 'shaderPack:'
    const index = lines.findIndex((line) => line.startsWith(key))
    const updated = `${key}${enabled ? fileName : ''}`
    if (index >= 0) lines[index] = updated
    else if (enabled) lines.push(updated)
  }
  await fs.writeFile(optionsPath, lines.join('\n'))
}
