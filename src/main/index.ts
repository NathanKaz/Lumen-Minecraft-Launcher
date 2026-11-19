import path from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { ensureDirs, dirs } from './core/paths'
import { registerIpc } from './ipc'
import { emitLog, emitToast } from './core/events'
import { msg } from './core/i18n'
import { initStore, getState } from './core/store'
import { initTray, isQuitting, markQuitting } from './core/tray'
import { checkUpdates, shouldCheckOnStartup } from './core/updates'

const isDev = !app.isPackaged

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 1120,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: '#0B0E14',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  })

  window.on('ready-to-show', () => {
    window.show()
    if (isDev) window.webContents.openDevTools({ mode: 'detach' })
  })

  window.on('close', (event) => {
    if (!isQuitting() && getState()?.settings.closeBehavior === 'tray') {
      event.preventDefault()
      window.hide()
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && rendererUrl) void window.loadURL(rendererUrl)
  else void window.loadFile(path.join(__dirname, '../renderer/index.html'))

  return window
}

async function bootstrap(): Promise<void> {
  const lock = app.requestSingleInstanceLock()
  if (!lock) {
    app.quit()
    return
  }
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  await app.whenReady()
  ensureDirs()
  initStore()
  registerIpc()
  emitLog('info', `Lumen Launcher started · ${process.platform} · ${process.arch}`)
  emitLog('info', msg('Каталог данных: {path}', { path: dirs.root }))
  createWindow()
  initTray()

  if (shouldCheckOnStartup()) {
    void checkUpdates().then((info) => {
      if (info.updateAvailable) {
        emitToast('info', msg('Доступна новая версия лаунчера: {version}', { version: info.latestVersion }))
      }
    }).catch(() => undefined)
  }

  app.on('activate', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (window) window.show()
    else createWindow()
  })
}

void bootstrap()

app.on('before-quit', markQuitting)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
