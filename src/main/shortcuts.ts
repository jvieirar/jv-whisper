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

// ── Hotkey capture mode ────────────────────────────────────────────────────
let captureMode = false
let captureCurrentKeys = new Set<number>()  // keys held right now
let captureAllSeen = new Set<number>()       // all keys pressed this session
let captureReleaseTimer: ReturnType<typeof setTimeout> | null = null

export function startHotkeyCapture(): void {
  captureMode = true
  captureCurrentKeys.clear()
  captureAllSeen.clear()
  if (captureReleaseTimer) { clearTimeout(captureReleaseTimer); captureReleaseTimer = null }
}

export function stopHotkeyCapture(): void {
  captureMode = false
  captureCurrentKeys.clear()
  captureAllSeen.clear()
  if (captureReleaseTimer) { clearTimeout(captureReleaseTimer); captureReleaseTimer = null }
}

// Canonical name → uiohook keycode (PS/2 scancodes)
const KEY_CODE_MAP: Record<string, number> = {
  // Modifiers
  Control: 29, Shift: 42, Alt: 56, Meta: 3675,
  // Whitespace / nav
  Space: 57, Enter: 28, Tab: 15, Backspace: 14, Escape: 1,
  // Function keys
  F1: 59, F2: 60, F3: 61, F4: 62,
  F5: 63, F6: 64, F7: 65, F8: 66,
  F9: 67, F10: 68, F11: 87, F12: 88,
  // Letters (QWERTY scancodes)
  Q: 16, W: 17, E: 18, R: 19, T: 20,
  Y: 21, U: 22, I: 23, O: 24, P: 25,
  A: 30, S: 31, D: 32, F: 33, G: 34,
  H: 35, J: 36, K: 37, L: 38,
  Z: 44, X: 45, C: 46, V: 47, B: 48,
  N: 49, M: 50,
  // Digits
  '1': 2, '2': 3, '3': 4, '4': 5, '5': 6,
  '6': 7, '7': 8, '8': 9, '9': 10, '0': 11
}

// Reverse map built from KEY_CODE_MAP — used to convert keycodes back to names
const KEYCODE_TO_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(KEY_CODE_MAP).map(([name, code]) => [code, name])
)

// Modifiers for uiohook right-side variants → same canonical name
const MODIFIER_ALIASES: Record<number, string> = {
  3676: 'Control', // Right Ctrl
  54: 'Shift',     // Right Shift
  3640: 'Alt',     // Right Alt (AltGr)
  3676: 'Meta'     // Right Meta (some keyboards)
}

const MODIFIER_ORDER = ['Control', 'Shift', 'Alt', 'Meta']

function keycodeToName(code: number): string {
  return MODIFIER_ALIASES[code] ?? KEYCODE_TO_NAME[code] ?? `Key${code}`
}

function formatCombo(keys: Set<number>): string {
  const names = [...new Set([...keys].map(keycodeToName))]
  names.sort((a, b) => {
    const ai = MODIFIER_ORDER.indexOf(a)
    const bi = MODIFIER_ORDER.indexOf(b)
    if (ai >= 0 && bi >= 0) return ai - bi
    if (ai >= 0) return -1
    if (bi >= 0) return 1
    return a.localeCompare(b)
  })
  return names.join('+')
}

function parseHotkey(hotkey: string): number[] {
  return hotkey.split('+').map((k) => {
    const code = KEY_CODE_MAP[k]
    if (code !== undefined) return code
    // Fallback: scan MODIFIER_ALIASES reverse
    const aliasEntry = Object.entries(MODIFIER_ALIASES).find(([, name]) => name === k)
    if (aliasEntry) return Number(aliasEntry[0])
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

    // ── Capture mode: record which keys are being held ─────────────────────
    if (captureMode) {
      captureCurrentKeys.add(e.keycode)
      captureAllSeen.add(e.keycode)
      // Reset commit timer — user is still pressing keys
      if (captureReleaseTimer) { clearTimeout(captureReleaseTimer); captureReleaseTimer = null }
      shortcutEmitter.emit('hotkeyCaptureUpdate', formatCombo(captureCurrentKeys))
      return
    }

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
    // ── Capture mode: when all keys released, start commit timer ──────────
    if (captureMode) {
      captureCurrentKeys.delete(e.keycode)
      shortcutEmitter.emit('hotkeyCaptureUpdate', formatCombo(captureCurrentKeys.size > 0 ? captureCurrentKeys : captureAllSeen))
      if (captureCurrentKeys.size === 0 && captureAllSeen.size > 0) {
        if (captureReleaseTimer) clearTimeout(captureReleaseTimer)
        captureReleaseTimer = setTimeout(() => {
          const combo = formatCombo(captureAllSeen)
          captureMode = false
          captureCurrentKeys.clear()
          captureAllSeen.clear()
          captureReleaseTimer = null
          shortcutEmitter.emit('hotkeyCaptured', combo)
        }, 500)
      }
      pressedKeys.delete(e.keycode)
      return
    }

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
