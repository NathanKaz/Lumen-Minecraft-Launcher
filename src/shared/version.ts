import pkg from '../../package.json'

/** Launcher version from package.json — the single source of truth for the UI and update checks. */
export const APP_VERSION: string = pkg.version
