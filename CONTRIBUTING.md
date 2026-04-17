# Contributing to jv-whisper

Thanks for taking the time to contribute! 🎉

## Before You Start

- Check [existing issues](https://github.com/jvieirar/jv-whisper/issues) to avoid duplicates.
- For large changes, open an issue first to discuss the approach.

## Workflow

1. **Fork** the repo and clone your fork:
   ```bash
   git clone https://github.com/<your-username>/jv-whisper
   cd jv-whisper
   ```

2. **Install dependencies:**
   ```bash
   npm install
   pip install mlx-whisper soundfile
   ```

3. **Create a branch** off `main`:
   ```bash
   git checkout -b fix/my-bug
   # or
   git checkout -b feat/my-feature
   ```

4. **Make your changes** and test them:
   ```bash
   npm run dev
   ```

5. **Commit** with a clear message:
   ```bash
   git commit -m "fix: hotkey not resetting after permission denial"
   ```

6. **Push** to your fork and **open a Pull Request** against `main`.

## Branch Naming

| Type | Pattern |
|---|---|
| Bug fix | `fix/short-description` |
| New feature | `feat/short-description` |
| Docs | `docs/short-description` |
| Refactor | `refactor/short-description` |

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `fix:` — bug fixes
- `feat:` — new features
- `docs:` — documentation only
- `chore:` — build/tooling changes

## What to Work On

Check issues tagged [`good first issue`](https://github.com/jvieirar/jv-whisper/issues?q=is%3Aissue+label%3A%22good+first+issue%22) or [`help wanted`](https://github.com/jvieirar/jv-whisper/issues?q=is%3Aissue+label%3A%22help+wanted%22).

## Platform Notes

- This app currently targets **macOS only** (Apple Silicon via mlx-whisper).
- Intel Mac contributions are welcome — see the note in the README about `openai-whisper`.

## Code Style

- TypeScript + React for the frontend/Electron layers.
- No formatter is enforced yet — just match the surrounding code style.

## Questions?

Open a [Discussion](https://github.com/jvieirar/jv-whisper/discussions) or an issue with the `question` label.
