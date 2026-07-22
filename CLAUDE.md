# Podcast Tracker — Claude Code Guide

## What this project is
A pipeline that tracks investment predictions made on podcasts (All-In, BG2, external appearances). It downloads YouTube transcripts, extracts structured predictions using an LLM, and serves them in a Next.js dashboard with live price scoring.

## Key files to know
```
llm_client.py           # LLM factory — all extraction goes through here
auto_update.py          # Daily orchestrator — runs the full pipeline
extract_all.py          # Extracts from All-In + BG2 episodes
extract_appearances.py  # Extracts from external appearances
discover_appearances.py # Finds new external videos via channel search
watcher.py              # Email digest on new episodes

predictions.json        # Master dataset (9,700+ predictions) — source of truth
episodes.json           # All-In episode index
bg2_episodes.json       # BG2 episode index
appearances.json        # External appearances index
experts.json            # Expert profiles and name aliases
source_channels.json    # YouTube channels to monitor per expert

dashboard/              # Next.js app at localhost:3001
  app/api/prices/       # Yahoo Finance price proxy
  app/api/refresh/      # Triggers pipeline from the UI
  public/predictions.json  # Synced copy of predictions.json (served statically)
```

## Environment setup
```bash
cp .env.example .env    # fill in LLM_PROVIDER + API key
source .venv/bin/activate
```

## LLM provider
Controlled by `LLM_PROVIDER` env var. All scripts use `make_client()` from `llm_client.py` — never call `anthropic.Anthropic()` or `openai.OpenAI()` directly.

```bash
# Anthropic (default)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini   # optional override
```

## Running the pipeline
```bash
source .env && python3 auto_update.py   # full update
python3 extract_all.py                  # re-extract All-In + BG2 only
python3 extract_appearances.py          # re-extract external appearances
```

## Running the dashboard
```bash
cd dashboard && npm run dev   # http://localhost:3001
```

## Transcripts
Stored in `transcripts/` (gitignored, ~185 MB for 2024+).
To download: `source .env && ./backfill.sh`
To download older years: `START_YEAR=2023 ./backfill.sh`

## Data shape (predictions.json)
Each prediction object has:
- `speaker`, `prediction`, `asset_type`, `ticker_or_name`
- `direction`: `bullish` | `bearish` | `neutral`
- `confidence`: `high` | `medium` | `low`
- `asset_type`: `stock` | `crypto` | `commodity` | `macro` | `sector` | `etf` | `index` | `other`
- `price_ticker`: Yahoo Finance symbol (for live price scoring)
- `episode_date`, `episode_title`, `episode_url`, `video_link` (deep-links to timestamp)
- `source`: `allin` | `bg2` | `external`

## Common tasks

**Add a new expert:**
1. Add to `experts.json` (name, aliases, image)
2. Add their channels to `source_channels.json`
3. `python3 discover_appearances.py` — find past videos
4. `python3 extract_appearances.py` — extract predictions

**Re-extract a single episode:**
Pass its video_id to extract_all.py or delete its predictions from predictions.json and re-run.

**Add a new data field to predictions:**
Edit the `extract()` function in `extract_all.py` and `extract_appearances.py` (the SYSTEM_PROMPT and the dict that builds each result). Run a backfill to populate historical data.

**Dashboard changes:**
Work in `dashboard/`. Data comes from `public/predictions.json` (static) and `/api/prices` (live). After changing the pipeline output shape, run `python3 auto_update.py` to sync.

## What NOT to do
- Don't hardcode file paths — always use `Path(__file__).resolve().parent` as base
- Don't call `anthropic.Anthropic()` directly — use `make_client()` from `llm_client.py`
- Don't edit `dashboard/public/predictions.json` directly — it's overwritten by the pipeline
