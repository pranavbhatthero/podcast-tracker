#!/usr/bin/env python3
"""
One-time backfill:
  1. Set source = "allin" | "bg2" on predictions that have no source
  2. Normalize legacy direction values to bullish/bearish/neutral
  3. Normalize legacy asset_type values to the known set

Safe to re-run (idempotent).
"""
import json
from pathlib import Path

BASE_DIR   = Path(__file__).resolve().parent
PREDS_FILE = BASE_DIR / "predictions.json"
DASH_PREDS = BASE_DIR / "dashboard" / "public" / "predictions.json"

preds    = json.loads(PREDS_FILE.read_text())
bg2_eps  = json.loads((BASE_DIR / "bg2_episodes.json").read_text())
allin_eps = json.loads((BASE_DIR / "episodes.json").read_text())

bg2_ids   = {e["video_id"] for e in bg2_eps}
allin_ids = {e["video_id"] for e in allin_eps}

DIRECTION_NORMALIZE = {
    "up": "bullish", "buy": "bullish", "long": "bullish", "overweight": "bullish",
    "down": "bearish", "sell": "bearish", "short": "bearish", "underweight": "bearish",
}
VALID_DIRECTIONS  = {"bullish", "bearish", "neutral"}
VALID_ASSET_TYPES = {"stock", "crypto", "commodity", "macro", "sector", "etf", "index", "other"}

def normalize_direction(d):
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

def normalize_asset_type(a):
    a = (a or "other").strip().lower()
    return a if a in VALID_ASSET_TYPES else "other"

src_fixed = dir_fixed = asset_fixed = 0

for p in preds:
    # --- source backfill ---
    if not p.get("source"):
        url = p.get("episode_url", "")
        vid = url.split("v=")[-1] if "v=" in url else ""
        if vid in bg2_ids:
            p["source"] = "bg2"
        elif vid in allin_ids:
            p["source"] = "allin"
        src_fixed += 1

    # --- direction normalization ---
    old_dir = p.get("direction", "neutral")
    new_dir = normalize_direction(old_dir)
    if new_dir != old_dir:
        p["direction"] = new_dir
        dir_fixed += 1

    # --- asset_type normalization ---
    old_at = p.get("asset_type", "other")
    new_at = normalize_asset_type(old_at)
    if new_at != old_at:
        p["asset_type"] = new_at
        asset_fixed += 1

PREDS_FILE.write_text(json.dumps(preds, indent=2))
DASH_PREDS.parent.mkdir(parents=True, exist_ok=True)
DASH_PREDS.write_text(json.dumps(preds, indent=2))

print(f"Done. source={src_fixed} fixed, direction={dir_fixed} normalized, asset_type={asset_fixed} normalized")
print(f"Total predictions: {len(preds)}")
