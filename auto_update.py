#!/usr/bin/env python3
"""
Auto-update pipeline for the All-In predictions dashboard.

1. Fetches latest episode lists from All-In and BG2 YouTube channels
2. Downloads transcripts for any new episodes
3. Runs extraction for new episodes only (skips already-processed)
4. Syncs predictions.json to dashboard/public/predictions.json
5. Logs a run summary to auto_update.log

Run daily via launchd or cron. Safe to re-run — skips already-processed episodes.
"""
import json, subprocess, sys, logging
from pathlib import Path
from datetime import datetime

BASE_DIR    = Path(__file__).resolve().parent
LOG_FILE    = BASE_DIR / 'auto_update.log'
VENV_PYTHON = BASE_DIR / '.venv' / 'bin' / 'python3'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger(__name__)

ALLIN_CHANNEL = "https://www.youtube.com/@allin"
BG2_CHANNEL   = "https://www.youtube.com/@bg2pod"

def fetch_latest_episodes(channel_url: str, max_videos: int = 10) -> list[dict]:
    """Fetch the most recent N episode metadata from a YouTube channel."""
    result = subprocess.run(
        [
            "yt-dlp", "--flat-playlist", "--playlist-end", str(max_videos),
            "--print", "%(id)s|%(title)s|%(upload_date)s|%(webpage_url)s",
            channel_url,
        ],
        capture_output=True, text=True
    )
    episodes = []
    for line in result.stdout.strip().splitlines():
        parts = line.split("|")
        if len(parts) >= 3:
            video_id, title, date_raw = parts[0], parts[1], parts[2]
            date = f"{date_raw[:4]}-{date_raw[4:6]}-{date_raw[6:8]}" if len(date_raw) == 8 else date_raw
            episodes.append({
                "video_id": video_id,
                "title": title,
                "date": date,
                "url": f"https://www.youtube.com/watch?v={video_id}",
            })
    return episodes

def load_known_ids(json_file: Path) -> set[str]:
    if not json_file.exists():
        return set()
    data = json.load(open(json_file))
    return {ep["video_id"] for ep in data}

def append_new_episodes(new_eps: list[dict], json_file: Path, channel: str) -> list[dict]:
    """Add new episodes to the episodes JSON file. Returns newly added list."""
    existing = json.load(open(json_file)) if json_file.exists() else []
    known_ids = {ep["video_id"] for ep in existing}
    added = []
    for ep in new_eps:
        if ep["video_id"] not in known_ids:
            ep["channel"] = channel
            ep["tags"] = []
            existing.insert(0, ep)
            added.append(ep)
    if added:
        json.dump(existing, open(json_file, "w"), indent=2)
    return added

def run_extraction() -> tuple[int, int]:
    """Run extract_all.py and return (new_predictions, total)."""
    result = subprocess.run(
        [str(VENV_PYTHON), str(BASE_DIR / "extract_all.py")],
        capture_output=True, text=True, cwd=str(BASE_DIR)
    )
    if result.returncode != 0:
        log.error(f"extract_all.py failed:\n{result.stderr[-2000:]}")
        return 0, 0

    # Parse "X new predictions added (Y total)" from output
    import re
    m = re.search(r'(\d+) new predictions added \((\d+) total\)', result.stdout)
    if m:
        return int(m.group(1)), int(m.group(2))
    return 0, 0

def run_appearances_discovery() -> int:
    """Run discover_appearances.py for the last 14 days. Returns new appearances count."""
    result = subprocess.run(
        [str(VENV_PYTHON), str(BASE_DIR / "discover_appearances.py"), "14"],
        capture_output=True, text=True, cwd=str(BASE_DIR)
    )
    import re
    m = re.search(r'(\d+) new appearances found', result.stdout)
    return int(m.group(1)) if m else 0

def run_appearances_extraction() -> tuple[int, int]:
    """Run extract_appearances.py. Returns (new, total)."""
    result = subprocess.run(
        [str(VENV_PYTHON), str(BASE_DIR / "extract_appearances.py")],
        capture_output=True, text=True, cwd=str(BASE_DIR)
    )
    import re
    m = re.search(r'(\d+) new predictions added \((\d+) total\)', result.stdout)
    if m:
        return int(m.group(1)), int(m.group(2))
    return 0, 0

def main():
    log.info("=" * 60)
    log.info("Auto-update started")

    # 1. Fetch latest episodes from both channels
    log.info("Fetching latest All-In episodes...")
    allin_latest = fetch_latest_episodes(ALLIN_CHANNEL, max_videos=5)
    log.info(f"  Found {len(allin_latest)} recent All-In episodes")

    log.info("Fetching latest BG2 episodes...")
    bg2_latest = fetch_latest_episodes(BG2_CHANNEL, max_videos=5)
    log.info(f"  Found {len(bg2_latest)} recent BG2 episodes")

    # 2. Add any new episodes to the episode lists
    allin_added = append_new_episodes(allin_latest, BASE_DIR / "episodes.json", "allin")
    bg2_added   = append_new_episodes(bg2_latest,   BASE_DIR / "bg2_episodes.json", "bg2")

    if allin_added:
        log.info(f"  New All-In episodes: {[e['title'][:50] for e in allin_added]}")
    if bg2_added:
        log.info(f"  New BG2 episodes: {[e['title'][:50] for e in bg2_added]}")

    if not allin_added and not bg2_added:
        log.info("No new episodes found — checking for new external appearances anyway")

    # 3. Run main extraction (only processes episodes not yet in predictions.json)
    log.info("Running extraction...")
    new_preds, total = run_extraction()
    log.info(f"  Extraction complete: {new_preds} new predictions ({total} total)")

    # 4. Discover + extract new external appearances (last 14 days)
    log.info("Discovering external appearances (last 14 days)...")
    new_appearances = run_appearances_discovery()
    log.info(f"  {new_appearances} new appearances found")

    if new_appearances > 0:
        log.info("Extracting external appearances...")
        new_ext, total_ext = run_appearances_extraction()
        log.info(f"  External extraction: {new_ext} new predictions ({total_ext} total)")
    else:
        new_ext = 0

    # 5. Summary
    log.info(f"Done. +{new_preds + new_ext} new predictions this run.")
    log.info("=" * 60)

    # Write last-run timestamp to a file the dashboard can read
    run_meta = {
        "last_run": datetime.utcnow().isoformat() + "Z",
        "new_predictions": new_preds + new_ext,
        "new_allin_episodes": len(allin_added),
        "new_bg2_episodes": len(bg2_added),
        "new_external_appearances": new_appearances,
    }
    json.dump(run_meta, open(BASE_DIR / "dashboard" / "public" / "last_update.json", "w"), indent=2)

if __name__ == "__main__":
    main()
