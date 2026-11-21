import { getState, updateProfile } from './store'
import { msg } from './i18n'
import { emitProgress, emitToast } from './events'
import {
  extractNatives,
  fetchVersionJson,
  installClientVersion,
  installLibraries,
  markVersionInstalled,
  resolveVersion
} from './install'

export { getVersionList } from './install'
import { installLoader } from './loaders'
import { createAutoBackup } from './backups'
import { ensureJava } from './javaInstall'
import { requiredJavaMajor } from './java'

export async function installProfile(
  profileId: string,
  loaderVersion?: string,
  skipAutoBackup = false,
  opts?: { signal?: AbortSignal; taskId?: string }
): Promise<void> {
  const profile = getState().profiles.find((entry) => entry.id === profileId)
  if (!profile) throw new Error(msg("Сборка не найдена"))

  if (!skipAutoBackup) await createAutoBackup(profileId, msg('Автобэкап перед установкой версии'))

  emitProgress({
    phase: 'version',
    message: msg('Подготовка Minecraft {version}', { version: profile.versionId }),
    percent: 0,
    current: 0,
    total: 1,
    bytes: 0,
    totalBytes: 0,
    speed: 0,
    taskId: opts?.taskId
  })

  const baseVersion = await fetchVersionJson(profile.versionId)
  await installClientVersion(profile.versionId, baseVersion, opts)
  await installLibraries(baseVersion, msg("Загрузка библиотек Minecraft"), opts)
  extractNatives({ ...baseVersion, id: profile.versionId })
  markVersionInstalled(profile.versionId)

  // Fabric/Forge/NeoForge installers are Java programs; make sure a suitable
  // runtime exists (downloading a managed JRE if allowed) before running them.
  if (profile.loader !== 'vanilla') {
    await ensureJava(requiredJavaMajor(profile.versionId), profileId)
  }
  const loaderVersionId = await installLoader(profile.loader, profile.versionId, loaderVersion)
  const launchId = loaderVersionId ?? profile.versionId
  const resolved = await resolveVersion(launchId)
  extractNatives({ ...resolved, id: launchId })
  markVersionInstalled(launchId)

  updateProfile(profileId, { loaderVersionId, versionId: profile.versionId })
  emitToast('success', msg('Minecraft {version} готов к запуску', { version: profile.versionId }))
}
