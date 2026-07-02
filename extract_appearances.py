#!/usr/bin/env python3
"""
Extract predictions from external appearances (appearances.json).
Same pipeline as extract_all.py but reads from appearances.json.
Adds source/source_name fields to each prediction.
"""
import json, re, sys, os
from pathlib import Path

BASE_DIR     = Path('/Users/pbhatt/claude-projects/i-m-all-in')
TRANSCRIPTS  = BASE_DIR / 'transcripts'
APPEAR_FILE  = BASE_DIR / 'appearances.json'
EXPERTS_FILE = BASE_DIR / 'experts.json'
PREDS_FILE   = BASE_DIR / 'predictions.json'
DASH_PREDS   = BASE_DIR / 'dashboard' / 'public' / 'predictions.json'

import anthropic, httpx

experts = json.load(open(EXPERTS_FILE))

# Build alias→canonical map
NORMALIZE = {}
for exp in experts:
    for alias in [exp['name']] + exp.get('aliases', []):
        NORMALIZE[alias] = exp['name']
    # Common misspellings already in aliases, but keep explicit ones too
NORMALIZE.update({
    'Chamath': 'Chamath Palihapitiya', 'Sacks': 'David Sacks',
    'Friedberg': 'David Friedberg', 'Jason': 'Jason Calacanis',
    'Brad Gersonner': 'Brad Gerstner', 'Brad Gershner': 'Brad Gerstner',
    'Gavin': 'Gavin Baker', 'Sherwin Wu': 'Shervin Wu',
    'Sunny Madra': 'Sundeep Madra',
})

SYSTEM_PROMPT = """\
You extract notable predictions and investment calls from podcast/interview transcripts.

For each notable call return a JSON object:
- "speaker"       : exact name of the person making the call
- "prediction"    : full sentence describing what they said (include specifics: price targets, % moves, timeframes)
- "asset_type"    : MUST be one of: "stock" | "crypto" | "commodity" | "macro" | "sector" | "etf" | "index" | "other"
- "ticker_or_name": ticker symbol or asset name (e.g. "MU", "NVDA", "copper", "bitcoin")
- "direction"     : MUST be one of: "bullish" | "bearish" | "neutral" (use "bullish" for up/buy/long, "bearish" for down/sell/short)
- "timeframe"     : when they expect this to play out
- "confidence"    : "high" | "medium" | "low"
- "timestamp"     : [HH:MM:SS] closest timestamp from the transcript
- "price_ticker"  : Yahoo Finance ticker symbol if applicable (e.g. "MU", "NVDA", "BTC-USD", "HG=F" for copper, "GC=F" for gold). For stocks always provide. For well-known commodities/crypto always provide. Else null.

Only include concrete predictions with a clear directional view. Skip vague commentary.
Return ONLY a valid JSON array. No markdown, no explanation."""

DIRECTION_NORMALIZE = {
    "up": "bullish", "buy": "bullish", "long": "bullish", "overweight": "bullish",
    "down": "bearish", "sell": "bearish", "short": "bearish", "underweight": "bearish",
}
VALID_DIRECTIONS  = {"bullish", "bearish", "neutral"}
VALID_ASSET_TYPES = {"stock", "crypto", "commodity", "macro", "sector", "etf", "index", "other"}

def normalize_direction(d):
    d = (d or "neutral").strip().lower()
    if d in VALID_DIRECTIONS: return d
    if d in DIRECTION_NORMALIZE: return DIRECTION_NORMALIZE[d]
    if "bull" in d: return "bullish"
    if "bear" in d or "sell" in d or "down" in d: return "bearish"
    return "neutral"

def normalize_asset_type(a):
    a = (a or "other").strip().lower()
    return a if a in VALID_ASSET_TYPES else "other"


def parse_vtt(path):
    content = Path(path).read_text(encoding='utf-8')
    blocks  = re.split(r'\n\n+', content)

    def to_secs(t):
        p = re.findall(r'\d+', t.split('.')[0])
        if len(p)==3: return int(p[0])*3600+int(p[1])*60+int(p[2])
        if len(p)==2: return int(p[0])*60+int(p[1])
        return 0

    raw = []
    for block in blocks:
        lines   = block.strip().split('\n')
        ts_line = next((l for l in lines if '-->' in l), None)
        if not ts_line: continue
        start, end = ts_line.split('-->')
        start = start.strip(); end = end.strip().split(' ')[0]
        if to_secs(end) - to_secs(start) <= 0.1: continue
        text_lines = [re.sub(r'<[^>]+>', '', l).strip() for l in lines
                      if '-->' not in l and not re.match(r'^\d+$', l.strip()) and l.strip()]
        text = ' '.join(text_lines).strip()
        if text:
            raw.append((to_secs(start), start, text))

    if not raw:
        return []

    from collections import defaultdict
    by_bucket = defaultdict(list)
    for secs, ts, text in raw:
        bucket = secs // 8
        by_bucket[bucket].append((secs, ts, text))

    segs = []
    seen_texts = set()
    for bucket in sorted(by_bucket):
        secs, ts, text = max(by_bucket[bucket], key=lambda x: len(x[2]))
        if text not in seen_texts:
            seen_texts.add(text)
            segs.append((ts, text))

    return segs


def ts_to_secs(ts):
    ts = ts.split('.')[0]
    p = re.findall(r'\d+', ts)
    if len(p) == 3:
        h, m, s = int(p[0]), int(p[1]), int(p[2])
        if s > 59: s = 0
        return h * 3600 + m * 60 + s
    if len(p) == 2: return int(p[0]) * 60 + int(p[1])
    return 0


def parse_json_array(raw):
    raw = re.sub(r'```(?:json)?\s*', '', raw).strip()
    start = raw.find('['); end = raw.rfind(']')
    if start == -1 or end == -1 or end < start: return []
    chunk = raw[start:end + 1]
    try:
        return json.loads(chunk)
    except json.JSONDecodeError:
        last = chunk.rfind('}')
        if last == -1: return []
        try:
            return json.loads(chunk[:last + 1].rstrip().rstrip(',') + ']')
        except:
            return []


def extract(client, appearance):
    vtt = TRANSCRIPTS / f"{appearance['video_id']}.en.vtt"
    if not vtt.exists():
        return []

    segs = parse_vtt(vtt)
    transcript = '\n'.join(f"[{ts}] {txt}" for ts, txt in segs)[:50000]

    # Use the experts known to appear in this video
    speakers = appearance.get('experts', [])
    if not speakers:
        return []
    names = ', '.join(speakers)

    try:
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content":
                f"Speakers to track: {names}\nEpisode: {appearance['title']}\nDate: {appearance.get('date', '')}\nSource: {appearance.get('source_name', '')}\n\nTranscript:\n{transcript}"}],
        )
        raw   = resp.content[0].text.strip()
        calls = parse_json_array(raw)
        results = []
        for c in calls:
            ts   = c.get('timestamp', '00:00:00').strip('[]')
            secs = ts_to_secs(ts)
            speaker = NORMALIZE.get(c.get('speaker', ''), c.get('speaker', ''))
            results.append({
                "speaker":       speaker,
                "prediction":    c.get("prediction", ""),
                "asset_type":    normalize_asset_type(c.get("asset_type", "other")),
                "ticker_or_name": c.get("ticker_or_name", ""),
                "direction":     normalize_direction(c.get("direction", "neutral")),
                "timeframe":     c.get("timeframe", ""),
                "confidence":    c.get("confidence", "medium"),
                "timestamp":     ts,
                "episode_title": appearance['title'],
                "episode_date":  appearance.get('date', ''),
                "episode_url":   appearance['url'],
                "video_link":    f"https://youtu.be/{appearance['video_id']}?t={secs}",
                "price_ticker":  c.get("price_ticker") or None,
                "source":        "external",
                "source_name":   appearance.get('source_name', appearance.get('source_id', '')),
            })
        return results
    except Exception as e:
        print(f"  ERROR {appearance['title'][:50]}: {e}", file=sys.stderr)
        return []


# Auth
_token   = os.environ.get("ANTHROPIC_AUTH_TOKEN", "")
_bedrock = os.environ.get("ANTHROPIC_BEDROCK_BASE_URL", "")
if _bedrock.endswith("/bedrock"):
    _base_url = _bedrock[:-len("/bedrock")]
elif _bedrock:
    _base_url = _bedrock.rstrip("/")
else:
    _base_url = None
_ca_bundle = os.environ.get("NODE_EXTRA_CA_CERTS", "")
if _token and _base_url:
    _http = httpx.Client(verify=_ca_bundle if _ca_bundle else True)
    client = anthropic.Anthropic(api_key=_token, base_url=_base_url, http_client=_http)
elif _token:
    client = anthropic.Anthropic(api_key=_token)
else:
    client = anthropic.Anthropic()

appearances = json.load(open(APPEAR_FILE)) if APPEAR_FILE.exists() else []
existing    = json.load(open(PREDS_FILE))

# Only process appearances that have transcripts and haven't been extracted yet
# Key on episode_url (video level) — if any predictions exist for this URL, skip
extracted_urls = {p.get('episode_url') for p in existing}
to_extract = [
    a for a in appearances
    if not a.get('no_transcript')
    and (TRANSCRIPTS / f"{a['video_id']}.en.vtt").exists()
    and a['url'] not in extracted_urls
]

print(f"Appearances to extract: {len(to_extract)} / {len(appearances)} total")

new_preds = []
for i, app in enumerate(to_extract):
    calls = extract(client, app)
    print(f"[{i+1}/{len(to_extract)}] {app.get('source_name','')[:20]:20}  {app.get('date',''):12}  {app['title'][:50]}  → {len(calls)} calls", flush=True)
    new_preds.extend(calls)

    if (i + 1) % 25 == 0:
        existing = json.load(open(PREDS_FILE))
        seen = {p.get('video_link', '') for p in existing}
        added = [p for p in new_preds if p.get('video_link', '') not in seen]
        merged = existing + added
        with open(PREDS_FILE, 'w') as f: json.dump(merged, f, indent=2)
        print(f"  [checkpoint] {len(added)} new ({len(merged)} total)")

existing  = json.load(open(PREDS_FILE))
seen_keys = {p.get('video_link', '') for p in existing}
added     = [p for p in new_preds if p.get('video_link', '') not in seen_keys]
merged    = existing + added

with open(PREDS_FILE, 'w') as f: json.dump(merged, f, indent=2)
DASH_PREDS.parent.mkdir(parents=True, exist_ok=True)
with open(DASH_PREDS, 'w') as f: json.dump(merged, f, indent=2)

print(f"\nDone. {len(added)} new predictions added ({len(merged)} total).")
