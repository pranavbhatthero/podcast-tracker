#!/usr/bin/env python3
"""
Extract predictions from All-In + BG2 episodes.
Priority: year_predictions tagged episodes first, then all others.
Downloads missing transcripts as needed.
"""
import json, os, re, subprocess, sys
from pathlib import Path

BASE_DIR     = Path(__file__).resolve().parent
TRANSCRIPTS  = BASE_DIR / 'transcripts'
BG2_FILE     = BASE_DIR / 'bg2_episodes.json'
ALLIN_FILE   = BASE_DIR / 'episodes.json'
PREDS_FILE   = BASE_DIR / 'predictions.json'
DASH_PREDS   = BASE_DIR / 'dashboard' / 'public' / 'predictions.json'
EXPERTS_FILE = BASE_DIR / 'experts.json'

TRANSCRIPTS.mkdir(exist_ok=True)

from llm_client import make_client

bg2_eps    = json.load(open(BG2_FILE))
allin_eps  = json.load(open(ALLIN_FILE))
experts    = json.load(open(EXPERTS_FILE))
existing   = json.load(open(PREDS_FILE)) if PREDS_FILE.exists() else []

ALLIN_SPEAKERS = [
    "Chamath","Sacks","Friedberg","Jason","Jason Calacanis",
    "David Sacks","David Friedberg","Chamath Palihapitiya",
]
BG2_SPEAKERS = [
    "Brad Gerstner","Bill Gurley","Gavin Baker","Jensen Huang",
    "Sam Altman","Satya Nadella","Thomas Laffont","Michael Dell","Aaron Levie",
]

SYSTEM_PROMPT = """\
You extract notable predictions and investment calls from podcast transcripts.

For each notable call return a JSON object:
- "speaker"       : exact name of the person making the call
- "prediction"    : full sentence describing what they said (include specifics: price targets, % moves, timeframes)
- "asset_type"    : MUST be one of: "stock" | "crypto" | "commodity" | "macro" | "sector" | "etf" | "index" | "other"
- "ticker_or_name": ticker symbol or asset name (e.g. "MU", "NVDA", "copper", "bitcoin")
- "direction"     : MUST be one of: "bullish" | "bearish" | "neutral" (use "bullish" for up/buy/long, "bearish" for down/sell/short)
- "timeframe"     : when they expect this to play out (e.g. "2025", "12 months", "near-term", "end of year")
- "confidence"    : "high" | "medium" | "low"
- "timestamp"     : [HH:MM:SS] closest timestamp from the transcript
- "price_ticker"  : Yahoo Finance ticker symbol if applicable (e.g. "MU", "NVDA", "BTC-USD", "HG=F" for copper, "GC=F" for gold, "CL=F" for oil). For stocks always provide. For well-known commodities/crypto always provide. Else null.

Only include concrete predictions/calls with a clear directional view. Skip vague commentary.
Include all speakers from the provided list, not just the most famous.
Return a JSON array, empty [] if none found."""


def parse_vtt(path):
    content = Path(path).read_text(encoding='utf-8')
    blocks  = re.split(r'\n\n+', content)

    def to_secs(t):
        p = re.findall(r'\d+', t.split('.')[0])
        if len(p)==3: return int(p[0])*3600+int(p[1])*60+int(p[2])
        if len(p)==2: return int(p[0])*60+int(p[1])
        return 0

    # Collect all (start_secs, start_ts, text) tuples
    raw = []
    for block in blocks:
        lines   = block.strip().split('\n')
        ts_line = next((l for l in lines if '-->' in l), None)
        if not ts_line: continue
        start, end = ts_line.split('-->')
        start = start.strip(); end = end.strip().split(' ')[0]
        if to_secs(end) - to_secs(start) <= 0.1: continue
        text_lines = [re.sub(r'<[^>]+>','',l).strip() for l in lines
                      if '-->' not in l and not re.match(r'^\d+$',l.strip()) and l.strip()]
        # Join all content lines (not just the last) to capture full rolling caption
        text = ' '.join(text_lines).strip()
        if text:
            raw.append((to_secs(start), start, text))

    if not raw:
        return []

    # Rolling-window captions: keep one entry per 8-second bucket (longest text wins)
    # This collapses overlapping blocks into one clean segment per ~sentence
    from collections import defaultdict
    by_bucket = defaultdict(list)
    for secs, ts, text in raw:
        bucket = secs // 8
        by_bucket[bucket].append((secs, ts, text))

    segs = []
    seen_texts = set()
    for bucket in sorted(by_bucket):
        # Pick the longest text in this 3-second window
        secs, ts, text = max(by_bucket[bucket], key=lambda x: len(x[2]))
        if text not in seen_texts:
            seen_texts.add(text)
            segs.append((ts, secs, text))

    return segs


def ts_to_secs(ts):
    # Handle both HH:MM:SS and HH:MM:SS.mmm (strip sub-second part)
    ts = ts.split('.')[0]
    p = re.findall(r'\d+', ts)
    if len(p)==3:
        h, m, s = int(p[0]), int(p[1]), int(p[2])
        # yt-dlp sometimes emits 3-digit "seconds" like 279 — clamp to valid range
        if s > 59: s = 0
        return h*3600 + m*60 + s
    if len(p)==2: return int(p[0])*60+int(p[1])
    return 0


def download_transcript(video_id):
    vtt = TRANSCRIPTS / f"{video_id}.en.vtt"
    if vtt.exists():
        return True
    url = f"https://www.youtube.com/watch?v={video_id}"
    print(f"  Downloading transcript for {video_id}...")
    result = subprocess.run(
        ["yt-dlp", "--write-auto-sub", "--skip-download",
         "--sub-lang", "en", "--sub-format", "vtt",
         "-o", str(TRANSCRIPTS / "%(id)s.%(ext)s"), url],
        capture_output=True, text=True, timeout=60
    )
    if vtt.exists():
        return True
    # Sometimes saved as .en.vtt or just .vtt
    for ext in ['.vtt']:
        alt = TRANSCRIPTS / f"{video_id}{ext}"
        if alt.exists():
            alt.rename(vtt)
            return True
    print(f"  WARNING: Could not download transcript for {video_id}", file=sys.stderr)
    return False


def parse_json_array(raw: str):
    """Robustly extract a JSON array from Claude's response."""
    # Strip markdown code fences
    raw = re.sub(r'```(?:json)?\s*', '', raw).strip()
    # Find the first '[' and last ']'
    start = raw.find('[')
    end   = raw.rfind(']')
    if start == -1 or end == -1 or end < start:
        return []
    chunk = raw[start:end+1]
    try:
        return json.loads(chunk)
    except json.JSONDecodeError:
        # Truncated JSON — walk back to the last complete object
        last_close = chunk.rfind('}')
        if last_close == -1:
            return []
        truncated = chunk[:last_close+1]
        # Remove trailing comma if present, then close array
        truncated = truncated.rstrip().rstrip(',') + ']'
        try:
            return json.loads(truncated)
        except json.JSONDecodeError:
            return []


DIRECTION_NORMALIZE = {
    "up": "bullish", "buy": "bullish", "long": "bullish", "overweight": "bullish",
    "down": "bearish", "sell": "bearish", "short": "bearish", "underweight": "bearish",
}
VALID_DIRECTIONS = {"bullish", "bearish", "neutral"}
VALID_ASSET_TYPES = {"stock", "crypto", "commodity", "macro", "sector", "etf", "index", "other"}

def normalize_direction(d: str) -> str:
    d = (d or "neutral").strip().lower()
    if d in VALID_DIRECTIONS:
        return d
    if d in DIRECTION_NORMALIZE:
        return DIRECTION_NORMALIZE[d]
    if "bull" in d:
        return "bullish"
    if "bear" in d or "sell" in d or "down" in d:
        return "bearish"
    return "neutral"

def normalize_asset_type(a: str) -> str:
    a = (a or "other").strip().lower()
    return a if a in VALID_ASSET_TYPES else "other"


def extract(client, episode, segs, speakers, source: str):
    transcript = '\n'.join(f"[{ts}] {txt}" for ts,_,txt in segs)[:50000]
    names = ', '.join(speakers)
    try:
        resp = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=[{"type":"text","text":SYSTEM_PROMPT,"cache_control":{"type":"ephemeral"}}],
            messages=[{"role":"user","content":
                f"Speakers to track: {names}\nEpisode: {episode['title']}\nDate: {episode['date']}\n\nTranscript:\n{transcript}"}],
        )
        raw   = resp.content[0].text.strip()
        calls = parse_json_array(raw)
        results = []
        for c in calls:
            ts   = c.get('timestamp','00:00:00').strip('[]')
            secs = ts_to_secs(ts)
            results.append({
                "speaker":       c.get("speaker",""),
                "prediction":    c.get("prediction",""),
                "asset_type":    normalize_asset_type(c.get("asset_type","other")),
                "ticker_or_name":c.get("ticker_or_name",""),
                "direction":     normalize_direction(c.get("direction","neutral")),
                "timeframe":     c.get("timeframe",""),
                "confidence":    c.get("confidence","medium"),
                "timestamp":     ts,
                "episode_title": episode['title'],
                "episode_date":  episode['date'],
                "episode_url":   episode['url'],
                "video_link":    f"https://youtu.be/{episode['video_id']}?t={secs}",
                "price_ticker":  c.get("price_ticker") or None,
                "source":        source,
            })
        return results
    except Exception as e:
        print(f"  Error extracting {episode['title'][:40]}: {e}", file=sys.stderr)
        return []


client, MODEL = make_client()
new_preds = []

# ── All-In episodes ──────────────────────────────────────────────────────────
# Priority: year_predictions tagged first, then all others with transcripts
year_pred_eps = [e for e in allin_eps if 'year_predictions' in e.get('tags', [])]
other_allin   = [e for e in allin_eps if 'year_predictions' not in e.get('tags', [])]
allin_ordered = year_pred_eps + other_allin

print(f"\n=== ALL-IN: {len(year_pred_eps)} prediction episodes + {len(other_allin)} others ===")
allin_processed = 0
for i, episode in enumerate(allin_ordered):
    vid = episode['video_id']
    vtt = TRANSCRIPTS / f"{vid}.en.vtt"

    # Download transcript if missing
    if not vtt.exists():
        download_transcript(vid)

    if not vtt.exists():
        print(f"[allin {i+1}/{len(allin_ordered)}] SKIP (no transcript): {episode['title'][:55]}")
        continue

    tag = " [PREDICTIONS]" if 'year_predictions' in episode.get('tags', []) else ""
    print(f"[allin {allin_processed+1}/{len(allin_ordered)}] {episode['date']}  {episode['title'][:55]}{tag}")
    segs  = parse_vtt(vtt)
    calls = extract(client, episode, segs, ALLIN_SPEAKERS, source="allin")
    print(f"         → {len(calls)} calls found")
    new_preds.extend(calls)
    allin_processed += 1

# ── BG2 episodes ─────────────────────────────────────────────────────────────
print(f"\n=== BG2: {len(bg2_eps)} episodes ===")
for i, episode in enumerate(bg2_eps):
    vid = episode['video_id']
    vtt = TRANSCRIPTS / f"{vid}.en.vtt"
    if not vtt.exists():
        download_transcript(vid)
    if not vtt.exists():
        print(f"[bg2 {i+1}/{len(bg2_eps)}] SKIP (no transcript): {episode['title'][:55]}")
        continue
    print(f"[bg2 {i+1}/{len(bg2_eps)}] {episode['date']}  {episode['title'][:55]}")
    segs  = parse_vtt(vtt)
    calls = extract(client, episode, segs, BG2_SPEAKERS, source="bg2")
    print(f"         → {len(calls)} calls found")
    new_preds.extend(calls)

# ── Merge ─────────────────────────────────────────────────────────────────────
# Key on video_link (encodes video_id + timestamp seconds) for tighter dedup
seen_keys = {p.get('video_link','') for p in existing}
added     = [p for p in new_preds if p.get('video_link','') not in seen_keys]
merged    = existing + added

with open(PREDS_FILE, 'w') as f:
    json.dump(merged, f, indent=2)

# Sync to dashboard
DASH_PREDS.parent.mkdir(parents=True, exist_ok=True)
with open(DASH_PREDS, 'w') as f:
    json.dump(merged, f, indent=2)

print(f"\nDone. {len(added)} new predictions added ({len(merged)} total).")
print(f"Synced to {DASH_PREDS}")
