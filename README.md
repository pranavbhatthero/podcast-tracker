# Podcast Tracker

Track investment predictions and market calls made by prominent investors and analysts across podcasts, interviews, and financial media. An LLM extracts structured predictions from transcripts; a Next.js dashboard surfaces them with live price data, expert scorecards, and consensus views.

**Current dataset:** 9,700+ predictions · 34 tracked experts · sources spanning 2020–present

## Quick start

```bash
git clone https://github.com/pranavbhatthero/podcast-tracker.git
cd podcast-tracker
./setup.sh        # installs everything and walks you through config
cd dashboard && npm run dev
# open http://localhost:3001
```

`setup.sh` handles Python venv, Node deps, `.env` creation, and optionally downloads transcripts. Requires macOS with `brew install python node yt-dlp`.

---

## What it does

1. **Discovers** new episodes from tracked YouTube channels (All-In, BG2 Pod, Lex Fridman, CNBC, Bloomberg, and more)
2. **Downloads** transcripts via `yt-dlp`
3. **Extracts** investment predictions using an LLM (Anthropic Claude or OpenAI) — speaker, asset, direction, ticker, timeframe, confidence
4. **Tracks prices** via Yahoo Finance to score past calls
5. **Displays** everything in a filterable dashboard with expert scorecards and consensus views

---

## Architecture

```
auto_update.py              # Daily orchestrator — runs the full pipeline
├── extract_all.py          # Extracts from All-In + BG2 episodes
├── extract_appearances.py  # Extracts from external appearances
└── discover_appearances.py # Finds new external videos via channel search

watcher.py                  # Email digest — polls for new episodes and notifies

dashboard/                  # Next.js app (served at localhost:3001)
├── app/api/prices/         # Yahoo Finance price proxy
├── app/api/refresh/        # Triggers pipeline run from UI
└── app/components/         # Dashboard, Scorecard, ConsensusView, SpeakerPanel…

predictions.json            # Master dataset (~9,700 predictions)
episodes.json               # All-In episode index
bg2_episodes.json           # BG2 episode index
appearances.json            # External appearance index
experts.json                # Expert profiles and channel aliases
source_channels.json        # YouTube channels to monitor per expert
```

---

## Data shape

Each prediction has:

| Field | Description |
|-------|-------------|
| `speaker` | Canonical expert name |
| `prediction` | Full sentence with specifics |
| `asset_type` | `stock` · `crypto` · `commodity` · `macro` · `sector` · `etf` · `index` · `other` |
| `ticker_or_name` | Ticker or asset name (e.g. `MU`, `bitcoin`) |
| `direction` | `bullish` · `bearish` · `neutral` |
| `timeframe` | When they expect it to play out |
| `confidence` | `high` · `medium` · `low` |
| `price_ticker` | Yahoo Finance symbol for price lookup |
| `episode_date` | ISO date of the episode |
| `video_link` | Deep link to the exact timestamp on YouTube |
| `source` | `allin` · `bg2` · `external` |

---

## Setup

### Prerequisites

- macOS (the scheduler uses launchd)
- Python 3.11+  →  `brew install python`
- Node.js 18+   →  `brew install node`
- yt-dlp        →  `brew install yt-dlp`
- An LLM API key — Anthropic **or** OpenAI (see below)

### Install

```bash
git clone https://github.com/pranavbhatthero/podcast-tracker.git
cd podcast-tracker

# 1. Python environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Dashboard
cd dashboard && npm install && cd ..
```

### Configure

```bash
cp .env.example .env
# Open .env and fill in your API key (see options below)
```

**Option A — Anthropic (default)**

```bash
# .env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

**Option B — OpenAI**

```bash
# .env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
# Optional: override model
LLM_MODEL=gpt-4o-mini
```

**Option C — Any OpenAI-compatible endpoint (Ollama, Together, etc.)**

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=ollama        # or any non-empty string
OPENAI_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.2
```

Then load your `.env` before running anything:

```bash
source .env   # or add to your ~/.zshrc
```

### Get historical data (first time only)

The repo ships with `predictions.json` already containing 9,700+ extracted predictions. Transcripts are not stored in git (they're large). To download 2024+ transcripts and re-run extraction:

```bash
./backfill.sh
# To go back further:
START_YEAR=2023 ./backfill.sh
```

### Run the pipeline

```bash
# Full update: fetch new episodes, download transcripts, extract, sync dashboard
source .env && python3 auto_update.py

# Dashboard only (no pipeline)
cd dashboard && npm run dev
# Open http://localhost:3001
```

### Schedule (macOS launchd)

Edit `com.allin.autoupdate.plist.example` — replace the `PATH_TO_REPO` placeholder with the absolute path to your clone, then:

```bash
cp com.allin.autoupdate.plist.example ~/Library/LaunchAgents/com.allin.autoupdate.plist
launchctl load ~/Library/LaunchAgents/com.allin.autoupdate.plist
```

The pipeline runs twice daily (6am and 6pm) by default.

---

## Dashboard

```bash
cd dashboard && npm run dev
# Open http://localhost:3001
```

**Views:**
- **All predictions** — filterable by source (All-In / BG2 / external), asset type, direction, year, and expert
- **Scorecard** — experts ranked by return on tracked calls
- **Consensus** — which assets multiple experts agree on
- **Speaker panel** — full prediction history per expert with price performance

---

## Adding a new expert

1. Add an entry to `experts.json` with `name`, `aliases`, and `image`
2. Add their YouTube channels to `source_channels.json`
3. Run `python3 discover_appearances.py` to backfill past appearances
4. Run `python3 extract_appearances.py` to extract predictions

---

## Notes

- `transcripts/` is gitignored — run `./backfill.sh` to download (≈185 MB for 2024+, ≈600 MB all-time)
- `.env` and `*.plist` are gitignored — contain credentials and local paths
- `dashboard/node_modules/` and `dashboard/.next/` are gitignored
- `llm_client.py` is the single place that wires up whichever LLM you configure
