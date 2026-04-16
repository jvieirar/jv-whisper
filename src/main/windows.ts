import { BrowserWindow, shell, app, nativeTheme } from 'electron'
import { join } from 'path'

const DEV = process.env['NODE_ENV'] === 'development'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 820,
    height: 620,
    minWidth: 640,
    minHeight: 440,
    show: false,
    frame: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f0f14' : '#ffffff',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Show in Dock + cmd+tab when window is visible, hide when it's not.
  // This makes it behave like a proper app when open, but disappear when closed.
  win.on('show', () => app.dock?.show())
  win.on('hide', () => app.dock?.hide())

  // Red close button hides rather than quits (tray app behavior)
  win.on('close', (e) => {
    e.preventDefault()
    win.hide()
  })

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (DEV && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
