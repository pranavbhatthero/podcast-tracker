#!/usr/bin/env python3
"""Extract market predictions from All-In podcast VTT transcripts using Claude."""

import json
import re
import sys
from pathlib import Path

import anthropic

VTT_FILE = Path(__file__).parent / "All-In's 2026 Predictions.en.vtt"
OUTPUT_FILE = Path(__file__).parent / "predictions.json"
EPISODE_TITLE = "All-In's 2026 Predictions"
EPISODE_DATE = "2026-01-01"
EPISODE_URL = "https://www.youtube.com/watch?v=yEb2DX0TzKM"
CHUNK_MINUTES = 9
MODEL = "claude-haiku-4-5-20251001"


def _secs(ts: str) -> float:
    """Convert HH:MM:SS.mmm to seconds."""
    h, m, s = ts.split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def _clean_line(line: str) -> str:
    """Strip VTT inline tags and HTML entities."""
    line = re.sub(r"<[^>]+>", "", line)
    line = line.replace("&gt;", ">").replace("&lt;", "<").replace("&amp;", "&")
    return line.strip()


def parse_vtt(path: Path) -> list[dict]:
    """Parse a WebVTT file and return deduplicated segments."""
    segments = []
    lines = path.read_text(encoding="utf-8").splitlines()

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Look for timestamp lines
        if "-->" in line:
            parts = line.split("-->")
            try:
                start = _secs(parts[0].strip().split()[0])
                end = _secs(parts[1].strip().split()[0])
            except (ValueError, IndexError):
                i += 1
                continue

            # Skip carry-forward blocks (duration ≤ 15ms)
            if end - start <= 0.015:
                i += 1
                continue

            # Collect content lines until blank
            i += 1
            content = []
            while i < len(lines) and lines[i].strip():
                content.append(lines[i].strip())
                i += 1

            if content:
                text = _clean_line(content[-1])
                if text:
                    segments.append({"start_secs": start, "text": text})
            continue

        i += 1

    return segments


def _fmt_time(secs: float) -> str:
    h = int(secs // 3600)
    m = int((secs % 3600) // 60)
    s = int(secs % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def build_chunks(segments: list[dict], chunk_minutes: int = CHUNK_MINUTES) -> list[str]:
    """Group segments into fixed-duration text chunks."""
    if not segments:
        return []

    chunk_secs = chunk_minutes * 60
    chunks = []
    current_lines = []
    chunk_start = 0

    for seg in segments:
        if seg["start_secs"] >= chunk_start + chunk_secs:
            if current_lines:
                chunks.append("\n".join(current_lines))
            current_lines = []
            chunk_start = (int(seg["start_secs"]) // chunk_secs) * chunk_secs

        current_lines.append(f"[{_fmt_time(seg['start_secs'])}] {seg['text']}")

    if current_lines:
        chunks.append("\n".join(current_lines))

    return chunks


def build_system_prompt() -> str:
    return """You are an expert financial analyst assistant. Your job is to extract market predictions, stock recommendations, and investment calls from All-In podcast transcripts.

## Hosts
The All-In podcast has four regular hosts. Use these name variants to identify speakers:
- **Jason**: Jason Calacanis (also called "Cowakanis", "Jason Calacanis", "J-Cal")
- **Chamath**: Chamath Palihapitiya (also called "Chimath", "Chamath Poly", "Chamath Palihapitiya")
- **Sacks**: David Sacks (also called "Sachs", "David Sacks")
- **Friedberg**: David Friedberg (also called "Freeberg", "Freedberg", "David Friedberg")
- **Guest**: Any non-host speaker (e.g., Brad Gerstner)

## Speaker Attribution Rules
- Lines starting with `>>` indicate a speaker change
- Hosts frequently address each other by name — use these as attribution anchors
- Attribute a statement to whoever was speaking most recently before the prediction
- When uncertain, use the closest named speaker before the prediction
- The `>>` marker means someone new started speaking

## What to Extract
Extract any statement where a host or guest:
1. Predicts price movement or performance of a specific asset (stock, commodity, crypto, index, sector)
2. Recommends buying, selling, or holding a specific asset
3. Makes a directional call on a market, sector, or macro trend
4. Names a specific company or ticker as a bet or investment thesis

## What NOT to Extract
- Vague commentary without a specific asset or direction
- Historical observations about past performance
- Questions or hypotheticals that aren't actual predictions
- General market commentary without a specific call

## Output Format
Return a JSON array. Each prediction is an object with these exact fields:
- `speaker`: Name of speaker ("Jason", "Chamath", "Sacks", "Friedberg", or guest name)
- `prediction`: Concise description of the prediction (1-2 sentences)
- `asset_type`: One of: "stock", "commodity", "crypto", "etf", "index", "sector", "macro", "other"
- `ticker_or_name`: Ticker symbol if known (e.g. "MU"), or descriptive name (e.g. "copper", "AI infrastructure")
- `direction`: One of: "up", "down", "bullish", "bearish", "buy", "sell", "hold", "neutral"
- `timeframe`: When the prediction applies (e.g. "2026", "next 12 months", "5 years", "unspecified")
- `confidence`: One of: "high", "medium", "low" — based on strength of language used
- `timestamp`: The [HH:MM:SS] timestamp from the transcript line where this prediction appears

If there are no predictions in this chunk, return an empty array: []

## Example Output
```json
[
  {
    "speaker": "Chamath",
    "prediction": "Copper will be a hot commodity in 2026 driven by AI infrastructure buildout and data center demand",
    "asset_type": "commodity",
    "ticker_or_name": "copper",
    "direction": "up",
    "timeframe": "2026",
    "confidence": "high",
    "timestamp": "00:14:32"
  },
  {
    "speaker": "Sacks",
    "prediction": "Bitcoin will reach $200,000 by end of 2026 as institutional adoption accelerates",
    "asset_type": "crypto",
    "ticker_or_name": "BTC",
    "direction": "up",
    "timeframe": "end of 2026",
    "confidence": "medium",
    "timestamp": "00:22:15"
  }
]
```

Return ONLY the JSON array, no other text, no markdown code fences."""


def extract_from_chunk(
    client: anthropic.Anthropic,
    system_prompt: str,
    chunk_text: str,
    chunk_index: int,
) -> list[dict]:
    """Call Claude to extract predictions from one transcript chunk."""
    print(f"  Processing chunk {chunk_index + 1}...", end=" ", flush=True)

    user_message = f"""Here is a portion of the All-In podcast transcript. Extract all market predictions and investment recommendations made in this segment.

TRANSCRIPT:
{chunk_text}"""

    with client.messages.stream(
        model=MODEL,
        max_tokens=2048,
        system=[
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        response_text = stream.get_final_text()

    # Strip markdown fences if present
    response_text = response_text.strip()
    if response_text.startswith("```"):
        response_text = re.sub(r"^```[a-z]*\n?", "", response_text)
        response_text = re.sub(r"\n?```$", "", response_text)

    try:
        predictions = json.loads(response_text)
        if not isinstance(predictions, list):
            predictions = []
    except json.JSONDecodeError:
        print(f"[WARN] JSON parse failed for chunk {chunk_index + 1}")
        predictions = []

    print(f"found {len(predictions)} prediction(s)")
    return predictions


def main():
    if not VTT_FILE.exists():
        print(f"ERROR: VTT file not found: {VTT_FILE}")
        sys.exit(1)

    print(f"Parsing {VTT_FILE.name}...")
    segments = parse_vtt(VTT_FILE)
    print(f"  {len(segments)} segments after deduplication")

    chunks = build_chunks(segments)
    print(f"  {len(chunks)} chunks of ~{CHUNK_MINUTES} minutes each")

    system_prompt = build_system_prompt()
    client = anthropic.Anthropic()

    print(f"\nExtracting predictions using {MODEL}...")
    all_predictions = []

    for i, chunk in enumerate(chunks):
        chunk_predictions = extract_from_chunk(client, system_prompt, chunk, i)
        for p in chunk_predictions:
            p["episode_title"] = EPISODE_TITLE
            p["episode_date"] = EPISODE_DATE
            p["episode_url"] = EPISODE_URL
        all_predictions.extend(chunk_predictions)

    print(f"\nTotal predictions extracted: {len(all_predictions)}")

    OUTPUT_FILE.write_text(json.dumps(all_predictions, indent=2), encoding="utf-8")
    print(f"Written to {OUTPUT_FILE}")

    # Summary by speaker
    from collections import Counter
    by_speaker = Counter(p["speaker"] for p in all_predictions)
    print("\nBy speaker:")
    for speaker, count in sorted(by_speaker.items(), key=lambda x: -x[1]):
        print(f"  {speaker}: {count}")


if __name__ == "__main__":
    main()
