import pkg from '../../package.json'

/** Launcher version from package.json — the single source of truth for the UI and update checks. */
export const APP_VERSION: string = pkg.version

/** Project links and license shown in the About section and used by update checks. */
export const APP_REPOSITORY = 'https://github.com/NathanKaz/Lumen-Minecraft-Launcher'
export const APP_LICENSE: string = pkg.license
