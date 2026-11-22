import type { LoaderType } from './types'

/** Short, stable loader labels used in instance names. */
export const LOADER_LABELS: Record<LoaderType, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge'
}

/** Default display name for a new instance, e.g. `26.3 Fabric`. */
export function defaultProfileName(versionId: string, loader: LoaderType): string {
  const version = versionId.trim()
  const label = LOADER_LABELS[loader] ?? loader
  return version ? `${version} ${label}` : label
}
