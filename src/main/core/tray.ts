import path from 'node:path'
import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import { msg } from './i18n'
import { getState } from './store'
import { getStatus, launchGame, stopGame } from './launch'
import { emitLog } from './events'

let tray: Tray | null = null
let quitting = false

export function markQuitting(): void {
  quitting = true
}

export function isQuitting(): boolean {
  return quitting
}

function icon(): Electron.NativeImage {
  const base = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'build')
  const image = nativeImage.createFromPath(path.join(base, 'icon.png'))
  if (!image.isEmpty()) return image.resize({ width: 16, height: 16 })
  return nativeImage.createEmpty()
}

function selectedProfileId(): string | undefined {
  return getState()?.selectedProfileId || getState()?.profiles[0]?.id
}

export function showLauncherWindow(): void {
  const window = BrowserWindow.getAllWindows()[0]
  if (!window) {
    emitLog('warn', msg('Окно лаунчера не найдено'))
    return
  }
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function rebuildMenu(): void {
  if (!tray) return
  const playing = getStatus() === 'running' || getStatus() === 'starting'
  const profileId = selectedProfileId()
  try {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Lumen Launcher', enabled: false },
      { type: 'separator' },
      { label: msg('Показать лаунчер'), click: showLauncherWindow },
      {
        label: playing ? msg('Остановить игру') : msg('Запустить игру'),
        enabled: Boolean(profileId),
        click: () => {
          if (!profileId) return
          if (playing) void stopGame()
          else void launchGame(profileId).catch(() => undefined)
        }
      },
      { type: 'separator' },
      { label: msg('Выход'), click: () => { markQuitting(); app.quit() } }
    ]))
  } catch {
    // Some Wayland desktops have no status-notifier implementation; the tray
    // is optional and must never prevent the launcher window from opening.
  }
}

export function initTray(): void {
  if (tray || process.platform === 'darwin') return
  try {
    tray = new Tray(icon())
    tray.setToolTip('Lumen Launcher')
    rebuildMenu()
    tray.on('double-click', showLauncherWindow)
  } catch (error) {
    tray = null
    emitLog('warn', `${msg('Не удалось создать иконку в трее')}: ${String(error)}`)
    return
  }
  app.on('browser-window-focus', rebuildMenu)
  app.on('before-quit', () => {
    tray?.destroy()
    tray = null
  })
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
