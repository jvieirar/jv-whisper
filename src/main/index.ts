import { app, systemPreferences } from 'electron'
import { initTray } from './tray'
import { initDatabase } from './database'
import { initStore } from './store'
import { registerIpcHandlers } from './ipc'
import { createMainWindow } from './windows'
import { startShortcutListener } from './shortcuts'

// Prevent multiple instances
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// Hide from dock — this is a menu bar app
app.dock?.hide()

app.whenReady().then(async () => {
  // Request microphone permission early so macOS shows the dialog before recording
  if (process.platform === 'darwin') {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone')
    if (micStatus !== 'granted') {
      await systemPreferences.askForMediaAccess('microphone')
    }
  }

  initStore()
  await initDatabase()

  const mainWindow = createMainWindow()

  initTray(mainWindow)
  registerIpcHandlers(mainWindow)
  startShortcutListener()
})

// Keep alive when all windows are closed (tray app behavior)
app.on('window-all-closed', (e: Event) => e.preventDefault())

app.on('second-instance', () => {
  // If user tries to open a second instance, focus existing window
})
