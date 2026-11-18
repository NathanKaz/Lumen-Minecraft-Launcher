import { getState, updateProfile } from './store'
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

export async function installProfile(profileId: string, loaderVersion?: string): Promise<void> {
  const profile = getState().profiles.find((entry) => entry.id === profileId)
  if (!profile) throw new Error('Сборка не найдена')

  emitProgress({
    phase: 'version',
    message: `Подготовка Minecraft ${profile.versionId}`,
    percent: 0,
    current: 0,
    total: 1,
    bytes: 0,
    totalBytes: 0,
    speed: 0
  })

  const baseVersion = await fetchVersionJson(profile.versionId)
  await installClientVersion(profile.versionId, baseVersion)
  await installLibraries(baseVersion, 'Загрузка библиотек Minecraft')
  extractNatives({ ...baseVersion, id: profile.versionId })
  markVersionInstalled(profile.versionId)

  const loaderVersionId = await installLoader(profile.loader, profile.versionId, loaderVersion)
  const launchId = loaderVersionId ?? profile.versionId
  const resolved = await resolveVersion(launchId)
  extractNatives({ ...resolved, id: launchId })
  markVersionInstalled(launchId)

  updateProfile(profileId, { loaderVersionId, versionId: profile.versionId })
  emitToast('success', `Minecraft ${profile.versionId} готов к запуску`)
}
