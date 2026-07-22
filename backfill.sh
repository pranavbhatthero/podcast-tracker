#!/usr/bin/env bash
# backfill.sh — download transcripts for 2024+ episodes and re-extract predictions.
#
# Run this once after cloning to catch up on historical data.
# Requires: yt-dlp, Python 3.11+, and a valid LLM key in .env
#
# Usage:
#   cp .env.example .env        # fill in your API key
#   source .env && ./backfill.sh
#
# To backfill a different year range, set START_YEAR:
#   START_YEAR=2023 ./backfill.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
START_YEAR="${START_YEAR:-2024}"
TRANSCRIPTS="$SCRIPT_DIR/transcripts"
mkdir -p "$TRANSCRIPTS"

# Load .env if it exists and isn't already sourced
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
  set +a
fi

PYTHON="$SCRIPT_DIR/.venv/bin/python3"
if [[ ! -f "$PYTHON" ]]; then
  echo "Virtual environment not found. Run: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

echo "=== Downloading transcripts for $START_YEAR+ episodes ==="

"$PYTHON" - <<PYEOF
import json, subprocess, sys
from pathlib import Path

base       = Path("$SCRIPT_DIR")
trans_dir  = Path("$TRANSCRIPTS")
start_year = int("$START_YEAR")

# Collect all episode video_ids with dates >= start_year
id_to_ep = {}
for fname in ["episodes.json", "bg2_episodes.json", "appearances.json"]:
    fpath = base / fname
    if not fpath.exists():
        continue
    for ep in json.loads(fpath.read_text()):
        vid  = ep.get("video_id", "")
        date = ep.get("date", "")
        if not vid or not date:
            continue
        try:
            year = int(date[:4])
        except ValueError:
            continue
        if year >= start_year:
            id_to_ep[vid] = ep

print(f"Found {len(id_to_ep)} episodes from {start_year}+")

downloaded = 0
skipped    = 0
failed     = 0

for vid, ep in sorted(id_to_ep.items(), key=lambda x: x[1].get("date", "")):
    vtt = trans_dir / f"{vid}.en.vtt"
    if vtt.exists():
        skipped += 1
        continue
    url = ep.get("url") or f"https://www.youtube.com/watch?v={vid}"
    print(f"  Downloading: [{ep.get('date','')}] {ep.get('title','')[:60]}")
    result = subprocess.run(
        ["yt-dlp", "--write-auto-sub", "--skip-download",
         "--sub-lang", "en", "--sub-format", "vtt",
         "-o", str(trans_dir / "%(id)s.%(ext)s"), url],
        capture_output=True, text=True, timeout=90
    )
    if vtt.exists():
        downloaded += 1
    else:
        print(f"    WARNING: no transcript for {vid}", file=sys.stderr)
        failed += 1

print(f"\nDone. Downloaded: {downloaded}  Already had: {skipped}  Failed: {failed}")
PYEOF

echo ""
echo "=== Running extraction pipeline ==="
"$PYTHON" "$SCRIPT_DIR/extract_all.py"
"$PYTHON" "$SCRIPT_DIR/extract_appearances.py"

echo ""
echo "=== Backfill complete ==="
echo "predictions.json now contains $(python3 -c "import json; print(len(json.load(open('$SCRIPT_DIR/predictions.json'))))" 2>/dev/null || echo '?') predictions"
