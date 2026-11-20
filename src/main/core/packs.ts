import path from 'node:path'
import fs from 'fs-extra'
import { dialog } from 'electron'
import { msg } from './i18n'
import { packsDir } from './paths'
import { setPackEnabled } from './skins'
import { emitToast } from './events'
import type { PackInfo, PackKind } from '@shared/types'

const GENERATED_SKIN_PACK = 'lumen-skin.zip'

export async function listPacks(profileId: string, kind: PackKind): Promise<PackInfo[]> {
  const dir = packsDir(profileId, kind)
  if (!(await fs.pathExists(dir))) return []

  const optionsPath = path.join(path.dirname(dir), 'options.txt')
  const options = await fs.pathExists(optionsPath) ? await fs.readFile(optionsPath, 'utf8') : ''
  const enabledNames = new Set<string>()
  if (kind === 'resource') {
    const match = options.match(/^resourcePacks:(.*)$/m)
    if (match) {
      try {
        const parsed = JSON.parse(match[1])
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            if (typeof entry === 'string' && entry.startsWith('file/')) enabledNames.add(entry.slice(5))
          }
        }
      } catch {
        // Invalid JSON means no explicit enabled list.
      }
    }
  } else {
    const match = options.match(/^shaderPack:(.*)$/m)
    if (match?.[1]) enabledNames.add(match[1].trim())
  }

  const entries = (await fs.readdir(dir)).filter((entry) => /\.(zip|jar)$/i.test(entry))
  const result: PackInfo[] = []
  for (const fileName of entries) {
    const full = path.join(dir, fileName)
    const stat = await fs.stat(full).catch(() => null)
    if (!stat?.isFile()) continue
    result.push({
      fileName,
      name: path.basename(fileName, path.extname(fileName)),
      kind,
      enabled: enabledNames.has(fileName),
      size: stat.size
    })
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

export async function installPack(profileId: string, kind: PackKind): Promise<void> {
  const result = await dialog.showOpenDialog({
    title: msg(kind === 'resource' ? 'Выберите набор ресурсов' : 'Выберите набор шейдеров'),
    filters: [
      { name: msg('Файлы .zip'), extensions: ['zip'] },
      { name: msg('Все файлы'), extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths[0]) return

  await installPackFile(profileId, kind, result.filePaths[0])
}

/** Installs an already selected resource/shader pack archive. */
export async function installPackFile(profileId: string, kind: PackKind, source: string): Promise<void> {
  const target = packsDir(profileId, kind)
  await fs.ensureDir(target)
  await fs.copy(source, path.join(target, path.basename(source)), { overwrite: true })
  emitToast('success', msg(kind === 'resource' ? 'Набор ресурсов установлен' : 'Набор шейдеров установлен'))
}

export async function togglePack(profileId: string, kind: PackKind, fileName: string, enabled: boolean): Promise<void> {
  if (fileName === GENERATED_SKIN_PACK) return
  await setPackEnabled(profileId, kind, fileName, enabled)
}

export async function deletePack(profileId: string, kind: PackKind, fileName: string): Promise<void> {
  if (fileName === GENERATED_SKIN_PACK) return
  const file = path.join(packsDir(profileId, kind), path.basename(fileName))
  if (await fs.pathExists(file)) await fs.remove(file)
  await setPackEnabled(profileId, kind, fileName, false)
  emitToast('success', msg(kind === 'resource' ? 'Набор ресурсов удалён' : 'Набор шейдеров удалён'))
}
