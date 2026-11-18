import path from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { ensureDirs, dirs } from './core/paths'
import { initStore } from './core/store'
import { registerIpc } from './ipc'
import { emitLog } from './core/events'

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
  emitLog('info', `Neon Launcher запущен · ${process.platform} · ${process.arch}`)
  emitLog('info', `Каталог данных: ${dirs.root}`)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

void bootstrap()

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
