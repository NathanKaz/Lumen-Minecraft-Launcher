import path from 'node:path'
import AdmZip from 'adm-zip'
import { msg } from './i18n'
import { installModpackFromPath } from './modpacks'
import { copyModFile } from './mods'
import { installPackFile } from './packs'
import { importWorldFilePath } from './worlds'

/**
 * Handles a file dropped onto an instance card. A plain .zip can be either a
 * world or a resource pack, so its contents decide where it goes.
 */
export async function importDroppedFile(profileId: string, filePath: string): Promise<void> {
  const extension = path.extname(filePath).toLowerCase()

  if (extension === '.jar') {
    await copyModFile(profileId, filePath)
    return
  }
  if (extension === '.mrpack') {
    await installModpackFromPath(profileId, filePath)
    return
  }
  if (extension === '.mcworld') {
    await importWorldFilePath(profileId, filePath)
    return
  }
  if (extension === '.zip') {
    const zip = new AdmZip(filePath)
    const isWorld = zip.getEntries().some((entry) => /(^|\/)level\.dat$/i.test(entry.entryName))
    if (isWorld) {
      await importWorldFilePath(profileId, filePath)
    } else {
      await installPackFile(profileId, 'resource', filePath)
    }
    return
  }
  throw new Error(msg('Поддерживаются файлы .jar, .mrpack, .zip и .mcworld'))
}
