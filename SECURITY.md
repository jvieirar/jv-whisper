# Security Policy

## Supported Versions

Only the latest release is actively maintained.

## Reporting a Vulnerability

**Please do not report security vulnerabilities via public GitHub issues.**

Use [GitHub's private security advisory feature](https://github.com/jvieirar/jv-whisper/security/advisories/new) to report vulnerabilities confidentially.

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Any suggested mitigations if you have them

You can expect an acknowledgement within a few days and a resolution or update within a reasonable timeframe depending on severity.

## Scope

jv-whisper runs **entirely offline and locally** — no data is sent to external servers unless you explicitly configure Ollama (which also runs locally). The main attack surfaces to be aware of:

- **Python subprocess execution** — the app spawns Python scripts with user-controlled model paths and audio files
- **electron-store settings** — stored unencrypted on disk; don't store sensitive tokens on shared machines
- **HuggingFace token** — stored in electron-store; treat it like a password
