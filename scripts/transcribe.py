#!/usr/bin/env python3
"""
jv-whisper transcription script.
Usage: transcribe.py <audio_file_path> [model_repo]

Outputs JSON: {"text": "...", "language": "en", "segments": [...]}
"""

import sys
import json
import os
import subprocess
import tempfile


def convert_to_wav(input_path: str) -> str:
    """Convert audio to 16kHz mono WAV using ffmpeg."""
    out = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    out.close()
    result = subprocess.run(
        [
            "ffmpeg", "-y", "-i", input_path,
            "-ar", "16000", "-ac", "1", "-f", "wav",
            out.name
        ],
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr.decode()}")
    return out.name


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: transcribe.py <audio_file> [model]"}))
        sys.exit(1)

    audio_path = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else "mlx-community/whisper-large-v3-turbo"

    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"Audio file not found: {audio_path}"}))
        sys.exit(1)

    try:
        import mlx_whisper  # noqa: F401
    except ImportError:
        print(
            json.dumps({
                "error": (
                    "mlx-whisper is not installed. Run: pip install mlx-whisper soundfile"
                )
            })
        )
        sys.exit(1)

    wav_path = audio_path
    converted = False

    # Convert to WAV if needed (Whisper works best with PCM WAV)
    if not audio_path.lower().endswith(".wav"):
        try:
            wav_path = convert_to_wav(audio_path)
            converted = True
        except Exception as e:
            # ffmpeg not available — let mlx_whisper try to handle it directly
            print(f"[warn] ffmpeg conversion failed: {e}", file=sys.stderr)

    try:
        import io
        import contextlib

        # mlx_whisper prints "Detected language: X" to stdout even with verbose=False.
        # Capture all of its stdout so only our JSON reaches the caller.
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            result = mlx_whisper.transcribe(
                wav_path,
                path_or_hf_repo=model,
                verbose=False,
            )

        output = {
            "text": result["text"].strip(),
            "language": result.get("language", ""),
            "segments": [
                {
                    "start": round(s["start"], 2),
                    "end": round(s["end"], 2),
                    "text": s["text"].strip(),
                }
                for s in result.get("segments", [])
            ],
        }
        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

    finally:
        if converted and os.path.exists(wav_path):
            os.unlink(wav_path)


if __name__ == "__main__":
    main()
