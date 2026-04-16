export const AUGMENTED_PATH = [
  process.env.PATH,
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/opt/local/bin'
].filter(Boolean).join(':')
