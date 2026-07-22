#!/usr/bin/env python3
"""
Discover external appearances of tracked experts.
Two strategies:
  1. Channel scan  — scan known curated channels for videos mentioning expert names
  2. YouTube search — ytsearch per expert's search_terms for broader coverage
Writes new entries to appearances.json (deduped by video_id).
Downloads transcripts for new entries.
"""
import json, re, subprocess, sys
from pathlib import Path
from datetime import datetime, timedelta

BASE_DIR     = Path(__file__).resolve().parent
TRANSCRIPTS  = BASE_DIR / 'transcripts'
CHANNELS_FILE = BASE_DIR / 'source_channels.json'
EXPERTS_FILE  = BASE_DIR / 'experts.json'
APPEAR_FILE   = BASE_DIR / 'appearances.json'
ALLIN_FILE    = BASE_DIR / 'episodes.json'
BG2_FILE      = BASE_DIR / 'bg2_episodes.json'

TRANSCRIPTS.mkdir(exist_ok=True)

# How far back to look
DAYS_BACK = int(sys.argv[1]) if len(sys.argv) > 1 else 365
CUTOFF    = (datetime.now() - timedelta(days=DAYS_BACK)).strftime('%Y%m%d')

channels = json.load(open(CHANNELS_FILE))
experts  = json.load(open(EXPERTS_FILE))
existing = json.load(open(APPEAR_FILE)) if APPEAR_FILE.exists() else []

# Build existing video_id sets to avoid duplicates across all sources
allin_vids = {e['video_id'] for e in json.load(open(ALLIN_FILE))}
bg2_vids   = {e['video_id'] for e in json.load(open(BG2_FILE))}
appear_vids = {e['video_id'] for e in existing}
known_vids  = allin_vids | bg2_vids | appear_vids

# Build expert alias lookup: lowercase alias -> canonical name
alias_to_canonical = {}
for exp in experts:
    for alias in [exp['name']] + exp.get('aliases', []):
        alias_to_canonical[alias.lower()] = exp['name']

def title_mentions_expert(title: str, expert_names: list[str]) -> list[str]:
    """Return canonical names mentioned in title."""
    title_lower = title.lower()
    found = set()
    for name in expert_names:
        canonical = alias_to_canonical.get(name.lower(), name)
        # Check all aliases for this expert
        exp = next((e for e in experts if e['name'] == canonical), None)
        names_to_check = [canonical] + (exp.get('aliases', []) if exp else [])
        for n in names_to_check:
            if n.lower() in title_lower:
                found.add(canonical)
                break
    return list(found)

def fetch_channel_videos(channel_url: str, channel_name: str, expert_names: list[str]) -> list[dict]:
    """Fetch recent videos from a channel and filter by expert appearances."""
    print(f"  Scanning {channel_name}...")
    try:
        result = subprocess.run(
            ["yt-dlp", "--flat-playlist", "--print", "%(id)s\t%(title)s\t%(upload_date)s\t%(webpage_url)s",
             "--dateafter", CUTOFF, channel_url],
            capture_output=True, text=True, timeout=120
        )
    except subprocess.TimeoutExpired:
        print(f"    TIMEOUT for {channel_name}", file=sys.stderr)
        return []

    videos = []
    for line in result.stdout.strip().split('\n'):
        if not line.strip(): continue
        parts = line.split('\t')
        if len(parts) < 4: continue
        vid_id, title, upload_date, url = parts[0], parts[1], parts[2], parts[3]
        if vid_id in known_vids: continue

        mentioned = title_mentions_expert(title, expert_names)
        if not mentioned: continue

        date_str = ''
        if upload_date and len(upload_date) == 8:
            date_str = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}"

        videos.append({
            'video_id':    vid_id,
            'title':       title,
            'date':        date_str,
            'url':         url,
            'source':      'external',
            'source_id':   channel_name,
            'experts':     mentioned,
        })
        print(f"    FOUND: {title[:65]} ({', '.join(mentioned)})")

    return videos

def search_expert(expert: dict) -> list[dict]:
    """YouTube search for an expert's appearances."""
    videos = []
    for term in expert.get('search_terms', []):
        query = f"ytsearch30:{term} interview {datetime.now().year}"
        print(f"  Search: {query!r}")
        try:
            result = subprocess.run(
                ["yt-dlp", "--flat-playlist", "--print",
                 "%(id)s\t%(title)s\t%(upload_date)s\t%(webpage_url)s\t%(channel)s",
                 query],
                capture_output=True, text=True, timeout=60
            )
        except subprocess.TimeoutExpired:
            continue

        for line in result.stdout.strip().split('\n'):
            if not line.strip(): continue
            parts = line.split('\t')
            if len(parts) < 5: continue
            vid_id, title, upload_date, url, channel = parts[0], parts[1], parts[2], parts[3], parts[4]
            if vid_id in known_vids: continue

            # Skip if from All-In or BG2 channels
            if 'allin' in channel.lower() or 'bg2' in channel.lower(): continue

            # Verify expert is actually mentioned
            mentioned = title_mentions_expert(title, [expert['name']] + expert.get('aliases', []))
            if not mentioned: continue

            date_str = ''
            if upload_date and len(upload_date) == 8:
                date_str = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}"
            if date_str and date_str < CUTOFF[:4] + '-' + CUTOFF[4:6] + '-' + CUTOFF[6:]:
                continue

            entry = {
                'video_id':  vid_id,
                'title':     title,
                'date':      date_str,
                'url':       url,
                'source':    'external',
                'source_id': channel,
                'experts':   [expert['name']],
            }
            if vid_id not in known_vids:
                known_vids.add(vid_id)
                videos.append(entry)
                print(f"    FOUND: {title[:65]}")

    return videos

def download_transcript(video_id: str) -> bool:
    vtt = TRANSCRIPTS / f"{video_id}.en.vtt"
    if vtt.exists(): return True
    url = f"https://www.youtube.com/watch?v={video_id}"
    result = subprocess.run(
        ["yt-dlp", "--write-auto-sub", "--skip-download",
         "--sub-lang", "en", "--sub-format", "vtt",
         "-o", str(TRANSCRIPTS / "%(id)s.%(ext)s"), url],
        capture_output=True, text=True, timeout=60
    )
    if vtt.exists(): return True
    for ext in ['.vtt']:
        alt = TRANSCRIPTS / f"{video_id}{ext}"
        if alt.exists():
            alt.rename(vtt)
            return True
    return False


new_appearances = []

# Strategy 1: Channel scan
print(f"\n=== CHANNEL SCAN (last {DAYS_BACK} days) ===")
for ch in channels:
    videos = fetch_channel_videos(ch['channel_url'], ch['name'], ch['experts'])
    for v in videos:
        v['source_id'] = ch['id']
        v['source_name'] = ch['name']
        if v['video_id'] not in known_vids:
            known_vids.add(v['video_id'])
            new_appearances.append(v)

# Strategy 2: YouTube search per expert
print(f"\n=== YOUTUBE SEARCH PER EXPERT ===")
for expert in experts:
    results = search_expert(expert)
    for v in results:
        v['source_name'] = v.get('source_id', 'YouTube')
        new_appearances.append(v)

print(f"\n=== DOWNLOADING TRANSCRIPTS ===")
downloaded = 0
for app in new_appearances:
    vid = app['video_id']
    ok = download_transcript(vid)
    if ok:
        downloaded += 1
        print(f"  ✓ {app['title'][:65]}")
    else:
        app['no_transcript'] = True
        print(f"  ✗ {app['title'][:65]}")

merged = existing + new_appearances
with open(APPEAR_FILE, 'w') as f:
    json.dump(merged, f, indent=2)

print(f"\nDone. {len(new_appearances)} new appearances found, {downloaded} transcripts downloaded.")
print(f"Total appearances.json: {len(merged)}")
