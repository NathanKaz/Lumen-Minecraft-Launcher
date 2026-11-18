import type { AppState, Profile, Settings } from '@shared/types'

/** Version that is actually launched: loader builds use the generated loader profile. */
export function launchVersionId(profile: Profile): string | undefined {
  return profile.loader === 'vanilla' ? profile.versionId : profile.loaderVersionId
}

export function isProfileInstalled(profile: Profile, state: AppState | null): boolean {
  if (!state) return false
  const versionId = launchVersionId(profile)
  return Boolean(versionId && state.installedVersions.includes(versionId))
}

export function effectiveMemory(profile: Profile, settings: Settings): number {
  return profile.memory ?? settings.memory
}
