#!/usr/bin/env python3
"""
Download a Whisper model from HuggingFace Hub into the local cache.
Usage: download_model.py <repo_id>
"""

import sys


def main():
    model = sys.argv[1] if len(sys.argv) > 1 else "mlx-community/whisper-large-v3-turbo"

    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("huggingface_hub not installed. Run setup first.", file=sys.stderr)
        sys.exit(1)

    print(f"Downloading {model}...")
    try:
        path = snapshot_download(
            repo_id=model,
            # Show per-file progress
            tqdm_class=None,
        )
        print(f"✓ Cached at: {path}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
