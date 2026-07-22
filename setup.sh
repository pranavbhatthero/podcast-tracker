#!/usr/bin/env bash
# setup.sh — first-time setup for podcast-tracker
# Run once after cloning: ./setup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   podcast-tracker  setup             ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Check prerequisites ────────────────────────────────────────────────────
check() {
  if ! command -v "$1" &>/dev/null; then
    echo "✗  $1 not found — install with: $2"
    exit 1
  fi
  echo "✓  $1"
}

echo "Checking prerequisites..."
check python3   "brew install python"
check node      "brew install node"
check npm       "brew install node"
check yt-dlp    "brew install yt-dlp"
echo ""

# ── 2. Python virtual environment ─────────────────────────────────────────────
if [[ ! -f ".venv/bin/python3" ]]; then
  echo "Creating Python virtual environment..."
  python3 -m venv .venv
fi
echo "✓  .venv"

echo "Installing Python dependencies..."
.venv/bin/pip install -q -r requirements.txt
echo "✓  Python deps installed"
echo ""

# ── 3. Dashboard dependencies ─────────────────────────────────────────────────
echo "Installing dashboard dependencies..."
cd dashboard && npm install --silent && cd ..
echo "✓  Node deps installed"
echo ""

# ── 4. .env setup ─────────────────────────────────────────────────────────────
if [[ ! -f ".env" ]]; then
  cp .env.example .env
  echo "✓  Created .env from .env.example"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ACTION REQUIRED: open .env and add your API key"
  echo ""
  echo "  Anthropic:  set ANTHROPIC_API_KEY=sk-ant-..."
  echo "  OpenAI:     set LLM_PROVIDER=openai and OPENAI_API_KEY=sk-..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Then run:  ./setup.sh  (again, to continue)"
  exit 0
fi

# ── 5. Check the API key is actually set ──────────────────────────────────────
source .env 2>/dev/null || true
PROVIDER="${LLM_PROVIDER:-anthropic}"
if [[ "$PROVIDER" == "openai" ]]; then
  KEY="${OPENAI_API_KEY:-}"
  KEY_NAME="OPENAI_API_KEY"
else
  KEY="${ANTHROPIC_API_KEY:-}"
  KEY_NAME="ANTHROPIC_API_KEY"
fi

if [[ -z "$KEY" || "$KEY" == *"..."* ]]; then
  echo "✗  $KEY_NAME is not set in .env"
  echo "   Open .env and fill in your API key, then re-run ./setup.sh"
  exit 1
fi
echo "✓  $KEY_NAME is set"
echo ""

# ── 6. Download transcripts and run extraction ────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  The repo includes predictions.json (9,700+ predictions)."
echo "  You can skip transcript download and use the dashboard right away,"
echo "  or download 2024+ transcripts to re-extract / add new episodes."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -r -p "Download 2024+ transcripts now? (~185 MB, takes ~10 min) [y/N]: " DOWNLOAD
if [[ "$DOWNLOAD" =~ ^[Yy]$ ]]; then
  ./backfill.sh
else
  echo "Skipped. Run ./backfill.sh later to download transcripts."
fi
echo ""

# ── 7. Done ───────────────────────────────────────────────────────────────────
echo "╔══════════════════════════════════════╗"
echo "║   Setup complete!                    ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "  Start the dashboard:   cd dashboard && npm run dev"
echo "  Open:                  http://localhost:3001"
echo ""
echo "  Run the pipeline:      source .env && python3 auto_update.py"
echo "  Schedule (daily):      see com.allin.autoupdate.plist.example"
echo ""
