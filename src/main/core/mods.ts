import path from 'node:path'
import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import { modsDir } from './paths'
import type { ModInfo } from '@shared/types'

function readZipText(zip: AdmZip, name: string): string | null {
  const entry = zip.getEntry(name)
  return entry ? entry.getData().toString('utf8') : null
}

function parseMetadata(file: string, fallback: string): Omit<ModInfo, 'fileName' | 'enabled' | 'size'> {
  const result: Omit<ModInfo, 'fileName' | 'enabled' | 'size'> = {
    name: fallback,
    version: '',
    loader: 'unknown'
  }
  try {
    const zip = new AdmZip(file)
    const fabric = readZipText(zip, 'fabric.mod.json') ?? readZipText(zip, 'quilt.mod.json')
    if (fabric) {
      const json = JSON.parse(fabric) as { name?: string; version?: string; description?: string; icon?: string }
      return {
        name: json.name ?? fallback,
        version: typeof json.version === 'string' ? json.version : '',
        description: json.description,
        icon: json.icon,
        loader: readZipText(zip, 'quilt.mod.json') ? 'quilt' : 'fabric'
      }
    }
    const forge = readZipText(zip, 'META-INF/mods.toml') ?? readZipText(zip, 'mcmod.info')
    if (forge) {
      if (forge.trim().startsWith('[')) {
        const json = (JSON.parse(forge) as Array<{ name?: string; version?: string; description?: string; logoFile?: string }>)[0]
        if (json) {
          return {
            name: json.name ?? fallback,
            version: json.version ?? '',
            description: json.description,
            icon: json.logoFile,
            loader: 'forge'
          }
        }
      }
      const name = forge.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1]
      const version = forge.match(/^\s*version\s*=\s*"([^"]+)"/m)?.[1]
      const description = forge.match(/^\s*description\s*=\s*"([^"]+)"/m)?.[1]
      return { name: name ?? fallback, version: version ?? '', description, loader: 'forge' }
    }
  } catch {
    // Файл может быть не модом — используем имя файла
  }
  return result
}

export async function listMods(profileId: string): Promise<ModInfo[]> {
  const dir = modsDir(profileId)
  if (!(await fs.pathExists(dir))) return []
  const entries = await fs.readdir(dir)
  const mods: ModInfo[] = []
  for (const entry of entries) {
    if (!/\.(jar|zip)(\.disabled)?$/i.test(entry)) continue
    const enabled = !entry.endsWith('.disabled')
    const fileName = enabled ? entry : entry.slice(0, -'.disabled'.length)
    const file = path.join(dir, entry)
    const stat = await fs.stat(file).catch(() => null)
    if (!stat?.isFile()) continue
    const cleanName = fileName.replace(/\.(jar|zip)$/i, '').replace(/-\d[\d.]*.*$/, '')
    mods.push({
      fileName,
      ...parseMetadata(file, cleanName),
      enabled,
      size: stat.size
    })
  }
  return mods.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name))
}

export async function toggleMod(profileId: string, fileName: string): Promise<void> {
  const dir = modsDir(profileId)
  const enabledPath = path.join(dir, fileName)
  const disabledPath = `${enabledPath}.disabled`
  if (await fs.pathExists(enabledPath)) await fs.rename(enabledPath, disabledPath)
  else if (await fs.pathExists(disabledPath)) await fs.rename(disabledPath, enabledPath)
}

export async function deleteMod(profileId: string, fileName: string): Promise<void> {
  const dir = modsDir(profileId)
  for (const candidate of [fileName, `${fileName}.disabled`]) {
    const file = path.join(dir, candidate)
    if (await fs.pathExists(file)) await fs.remove(file)
  }
}

export async function copyModFile(profileId: string, source: string): Promise<void> {
  const target = modsDir(profileId)
  await fs.ensureDir(target)
  await fs.copy(source, path.join(target, path.basename(source)), { overwrite: true })
}
