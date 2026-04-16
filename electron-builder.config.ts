import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'com.jv.whisper',
  productName: 'jv-whisper',
  copyright: 'Copyright © 2025 jv',
  mac: {
    category: 'public.app-category.productivity',
    // icon: 'assets/icon.icns', // Uncomment once you have an .icns file
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] }
    ],
    extendInfo: {
      LSUIElement: true, // Hides from dock (menu bar app)
      NSMicrophoneUsageDescription:
        'jv-whisper needs microphone access to record your voice for transcription.',
      NSAppleEventsUsageDescription:
        'jv-whisper needs Accessibility access to detect global keyboard shortcuts.'
    }
  },
  files: [
    'out/**/*',
    'scripts/**/*',
    'assets/**/*',
    '!assets/sounds/.gitkeep'
  ],
  extraResources: [
    { from: 'scripts/', to: 'scripts/', filter: ['**/*'] }
  ],
  directories: {
    buildResources: 'assets',
    output: 'dist'
  },
  publish: null
}

export default config
