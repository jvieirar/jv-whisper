import { EventEmitter } from 'events'
import { getSetting } from './store'

// Lazily required so app doesn't crash if uiohook-napi fails to load
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let uIOhook: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let UiohookKey: any = null

export const shortcutEmitter = new EventEmitter()

let isListening = false
let recordingActive = false
const pressedKeys = new Set<number>()

// Mapping from human-readable key names to uiohook keycodes
const KEY_CODE_MAP: Record<string, number> = {
  Control: 29,
  Shift: 42,
  Alt: 56,
  Meta: 3675, // Left Cmd on macOS
  Space: 57,
  F1: 59, F2: 60, F3: 61, F4: 62,
  F5: 63, F6: 64, F7: 65, F8: 66,
  F9: 67, F10: 68, F11: 87, F12: 88
}

function parseHotkey(hotkey: string): number[] {
  return hotkey.split('+').map((k) => {
    const code = KEY_CODE_MAP[k]
    if (code !== undefined) return code
    // Single character keys — use charCodeAt as fallback approximation
    return k.toUpperCase().charCodeAt(0)
  })
}

function checkHotkeyDown(keyCodes: number[]): boolean {
  return keyCodes.every((code) => pressedKeys.has(code))
}

export function startShortcutListener(): void {
  if (isListening) return

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const hook = require('uiohook-napi')
    uIOhook = hook.uIOhook
    UiohookKey = hook.UiohookKey
  } catch (err) {
    console.error('[shortcuts] uiohook-napi failed to load:', err)
    console.error('[shortcuts] Global hotkeys will not work. Run: npm install')
    return
  }

  uIOhook.on('keydown', (e: { keycode: number }) => {
    pressedKeys.add(e.keycode)

    const hotkey = getSetting('hotkey')
    const mode = getSetting('hotkeySwitchMode')
    const keyCodes = parseHotkey(hotkey)

    if (!checkHotkeyDown(keyCodes)) return

    if (mode === 'hold' && !recordingActive) {
      recordingActive = true
      shortcutEmitter.emit('recordStart')
    } else if (mode === 'toggle') {
      if (!recordingActive) {
        recordingActive = true
        shortcutEmitter.emit('recordStart')
      } else {
        recordingActive = false
        shortcutEmitter.emit('recordStop')
      }
    }
  })

  uIOhook.on('keyup', (e: { keycode: number }) => {
    const hotkey = getSetting('hotkey')
    const mode = getSetting('hotkeySwitchMode')
    const keyCodes = parseHotkey(hotkey)

    // In hold mode: release any of the hotkey keys → stop recording
    if (mode === 'hold' && recordingActive && keyCodes.includes(e.keycode)) {
      recordingActive = false
      shortcutEmitter.emit('recordStop')
    }

    pressedKeys.delete(e.keycode)
  })

  try {
    uIOhook.start()
    isListening = true
    console.log('[shortcuts] Listening for hotkey:', getSetting('hotkey'))
  } catch (err) {
    console.error('[shortcuts] Failed to start uiohook (Accessibility permission required):', err)
    shortcutEmitter.emit('accessibilityError')
  }
}

export function stopShortcutListener(): void {
  if (!isListening || !uIOhook) return
  uIOhook.stop()
  isListening = false
  pressedKeys.clear()
  recordingActive = false
}

export function restartShortcutListener(): void {
  stopShortcutListener()
  startShortcutListener()
}
