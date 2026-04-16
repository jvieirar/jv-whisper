import { Tray, Menu, BrowserWindow, nativeImage, app } from 'electron'

let tray: Tray | null = null

export function initTray(mainWindow: BrowserWindow): void {
  // Use an empty image — we'll drive the tray via title text (emoji) on macOS
  tray = new Tray(nativeImage.createEmpty())
  setTrayState('idle')

  tray.on('click', () => {
    toggleWindow(mainWindow)
  })

  buildContextMenu(mainWindow)
}

export function setTrayState(state: 'idle' | 'recording' | 'processing'): void {
  if (!tray) return
  const labels: Record<typeof state, string> = {
    idle: ' 🎙',
    recording: ' 🔴',
    processing: ' ⏳'
  }
  const tips: Record<typeof state, string> = {
    idle: 'jv-whisper — ready (hold hotkey to record)',
    recording: 'jv-whisper — recording...',
    processing: 'jv-whisper — transcribing...'
  }
  tray.setTitle(labels[state])
  tray.setToolTip(tips[state])
}

function toggleWindow(win: BrowserWindow): void {
  if (win.isVisible() && win.isFocused()) {
    win.hide()
  } else {
    win.show()
    win.focus()
  }
}

function buildContextMenu(mainWindow: BrowserWindow): void {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    {
      label: 'jv-whisper',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Show / Hide',
      accelerator: 'Cmd+Shift+W',
      click: () => toggleWindow(mainWindow)
    },
    { type: 'separator' },
    {
      label: 'Quit',
      accelerator: 'Cmd+Q',
      click: () => app.exit(0)
    }
  ])
  tray.setContextMenu(menu)
}
