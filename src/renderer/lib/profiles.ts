import type { AppState, Profile, ProfileSort, Settings } from '@shared/types'

/** Favorites always lead; the remaining builds follow the selected ordering. */
export function sortProfiles(profiles: Profile[], sort: ProfileSort = 'default'): Profile[] {
  const compare = (a: Profile, b: Profile): number => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    if (sort === 'lastPlayed') return (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0)
    if (sort === 'playtime') return b.playtimeMinutes - a.playtimeMinutes
    return 0
  }
  return [...profiles].sort((a, b) => {
    const favorite = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite))
    return favorite || compare(a, b)
  })
}

export function profileTags(profile: Profile): string[] {
  return (profile.tags ?? []).map((tag) => tag.trim()).filter(Boolean)
}

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
