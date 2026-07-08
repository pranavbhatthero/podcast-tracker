# Podcast Tracker

Track investment predictions and market calls made by prominent investors and analysts across podcasts, interviews, and financial media. Claude extracts structured predictions from transcripts; a Next.js dashboard surfaces them with live price data, expert scorecards, and consensus views.

---

## What it does

1. **Discovers** new episodes from tracked YouTube channels (All-In, BG2 Pod, Lex Fridman, CNBC, Bloomberg, and more)
2. **Downloads** transcripts via `yt-dlp`
3. **Extracts** investment predictions using Claude Haiku — speaker, asset, direction, ticker, timeframe, confidence
4. **Tracks prices** via Yahoo Finance to score past calls
5. **Displays** everything in a filterable dashboard with expert scorecards and consensus views

**Current dataset:** 9,700+ predictions · 34 tracked experts · sources spanning 2020–present

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

- Python 3.11+
- Node.js 18+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (`brew install yt-dlp`)
- An Anthropic API key (or Salesforce Bedrock gateway credentials)

### Install

```bash
# Python deps
python3 -m venv .venv
source .venv/bin/activate
pip install anthropic httpx yt-dlp

# Dashboard deps
cd dashboard && npm install
```

### Configure

Copy `config.json` and fill in your email credentials if you want digest notifications:

```json
{
  "notify_email": "you@example.com",
  "notify_from_email": "you@example.com",
  "smtp_host": "smtp.gmail.com",
  "smtp_port": 587,
  "smtp_user": "you@example.com",
  "smtp_password": "your-app-password",
  "dashboard_url": "http://localhost:3001"
}
```

Set your API key:

```bash
export ANTHROPIC_API_KEY=sk-...
# Or for Salesforce Bedrock:
export ANTHROPIC_AUTH_TOKEN=sk-...
export ANTHROPIC_BEDROCK_BASE_URL=https://your-gateway/bedrock
```

### Run the pipeline

```bash
# Full update (fetch new episodes, extract predictions, sync dashboard)
python3 auto_update.py

# Dashboard only
cd dashboard && npm run dev
```

### Schedule (macOS launchd)

Edit `com.allin.autoupdate.plist.example` with your paths and token, copy to `~/Library/LaunchAgents/`, then:

```bash
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

- `transcripts/` is gitignored — re-downloaded on demand (~600 MB when fully populated)
- `config.json` and `*.plist` are gitignored — contain local paths and credentials
- `dashboard/node_modules/` and `dashboard/.next/` are gitignored
