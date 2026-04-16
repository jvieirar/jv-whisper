import ElectronStore from 'electron-store'

export interface Settings {
  hotkey: string
  hotkeySwitchMode: 'hold' | 'toggle'
  whisperModel: string
  whisperPythonPath: string
  advancedParsingEnabled: boolean
  advancedParsingModel: string
  soundEnabled: boolean
  autoCopyToClipboard: boolean
  theme: 'system' | 'light' | 'dark'
  hfToken: string
}

const defaults: Settings = {
  hotkey: 'Control+Space',
  hotkeySwitchMode: 'hold',
  whisperModel: 'mlx-community/whisper-large-v3-turbo',
  whisperPythonPath: 'python3',
  advancedParsingEnabled: false,
  advancedParsingModel: '',
  soundEnabled: true,
  autoCopyToClipboard: false,
  theme: 'system',
  hfToken: ''
}

let store: ElectronStore<Settings>

export function initStore(): void {
  store = new ElectronStore<Settings>({ defaults })
}

export function getStore(): ElectronStore<Settings> {
  return store
}

export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  return store.get(key)
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  store.set(key, value)
}

export function getAllSettings(): Settings {
  return {
    hotkey: store.get('hotkey'),
    hotkeySwitchMode: store.get('hotkeySwitchMode'),
    whisperModel: store.get('whisperModel'),
    whisperPythonPath: store.get('whisperPythonPath'),
    advancedParsingEnabled: store.get('advancedParsingEnabled'),
    advancedParsingModel: store.get('advancedParsingModel'),
    soundEnabled: store.get('soundEnabled'),
    autoCopyToClipboard: store.get('autoCopyToClipboard'),
    theme: store.get('theme'),
    hfToken: store.get('hfToken')
  }
}
