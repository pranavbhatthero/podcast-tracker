#!/usr/bin/env python3
"""
Expert watcher — polls YouTube channels + searches for appearances every 12 hours.
Extracts notable calls via Claude, sends digest via email.

Usage:
  python3 watcher.py          # normal run
  python3 watcher.py --init   # seed seen-state with all existing episodes (run once)
  python3 watcher.py --test   # dry run: extract + print, no iMessage
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

BASE_DIR      = Path(__file__).resolve().parent
EXPERTS_FILE  = BASE_DIR / "experts.json"
STATE_FILE    = BASE_DIR / "watcher_state.json"
TRANSCRIPTS   = BASE_DIR / "transcripts"
KNOWN_EPISODE_FILES = ["episodes.json", "bg2_episodes.json"]

TRANSCRIPTS.mkdir(exist_ok=True)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

CONFIG_FILE  = BASE_DIR / "config.json"
CONFIG       = json.loads(CONFIG_FILE.read_text()) if CONFIG_FILE.exists() else {}
DASHBOARD_URL = CONFIG.get("dashboard_url", "http://localhost:3001")

# Channels that host multiple tracked experts — extract all at once
MULTI_EXPERT_CHANNELS = {
    "https://www.youtube.com/@allin":    ["Chamath Palihapitiya", "David Sacks", "David Friedberg", "Jason Calacanis"],
    "https://www.youtube.com/@BG2Pod":   ["Brad Gerstner", "Bill Gurley"],
}

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"seen": [], "last_run": None}

def save_state(state):
    STATE_FILE.write_text(json.dumps(state, indent=2))

# ---------------------------------------------------------------------------
# YouTube fetching
# ---------------------------------------------------------------------------

def latest_from_channel(channel_url, limit=5):
    r = subprocess.run(
        ["yt-dlp", "--flat-playlist", f"--playlist-end={limit}", "--dump-json", channel_url],
        capture_output=True, text=True, timeout=90
    )
    videos = []
    for line in r.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        d = json.loads(line)
        videos.append({
            "video_id":        d["id"],
            "title":           d.get("title", ""),
            "channel_url":     channel_url,
            "url":             f"https://www.youtube.com/watch?v={d['id']}",
            "duration_seconds": d.get("duration") or 0,
        })
    return videos

def search_youtube(query, limit=5):
    r = subprocess.run(
        ["yt-dlp", f"ytsearch{limit}:{query}", "--flat-playlist", "--dump-json"],
        capture_output=True, text=True, timeout=90
    )
    videos = []
    for line in r.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        d = json.loads(line)
        videos.append({
            "video_id":        d["id"],
            "title":           d.get("title", ""),
            "channel_url":     d.get("channel_url") or d.get("uploader_url", ""),
            "channel_name":    d.get("channel") or d.get("uploader", ""),
            "url":             f"https://www.youtube.com/watch?v={d['id']}",
            "duration_seconds": d.get("duration") or 0,
        })
    return videos

# ---------------------------------------------------------------------------
# Transcript
# ---------------------------------------------------------------------------

def download_transcript(video_id):
    path = TRANSCRIPTS / f"{video_id}.en.vtt"
    if path.exists():
        return path
    subprocess.run(
        ["yt-dlp", "--write-auto-sub", "--sub-lang", "en", "--skip-download",
         "--output", str(TRANSCRIPTS / "%(id)s.%(ext)s"),
         f"https://www.youtube.com/watch?v={video_id}"],
        capture_output=True, text=True, timeout=60
    )
    return path if path.exists() else None

def parse_vtt(path):
    content = Path(path).read_text(encoding="utf-8")
    blocks  = re.split(r'\n\n+', content)
    seen    = set()
    segs    = []
    for block in blocks:
        lines   = block.strip().split('\n')
        ts_line = next((l for l in lines if '-->' in l), None)
        if not ts_line:
            continue
        start, end = ts_line.split('-->')
        start = start.strip()
        end   = end.strip().split(' ')[0]

        def to_secs(t):
            p = re.findall(r'\d+', t.split('.')[0])
            if len(p) == 3: return int(p[0])*3600 + int(p[1])*60 + int(p[2])
            if len(p) == 2: return int(p[0])*60  + int(p[1])
            return 0

        if to_secs(end) - to_secs(start) <= 0.1:
            continue
        text_lines = [re.sub(r'<[^>]+>', '', l)
                      for l in lines
                      if '-->' not in l and not re.match(r'^\d+$', l.strip()) and l.strip()]
        text = text_lines[-1].strip() if text_lines else ''
        if text and text not in seen:
            seen.add(text)
            segs.append((start, to_secs(start), text))
    return segs

def transcript_text(segs, max_chars=40000):
    lines = [f"[{ts}] {txt}" for ts, _, txt in segs]
    return "\n".join(lines)[:max_chars]

# ---------------------------------------------------------------------------
# Claude extraction
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You extract notable statements made by specific experts from podcast/interview transcripts.

For each notable statement return a JSON object with:
- "speaker"     : exact name of the expert (from the list provided)
- "type"        : "prediction" | "stock_call" | "macro_view" | "company_opinion" | "strong_take"
- "summary"     : one sentence — what they said
- "quote"       : the most relevant verbatim 1-2 sentences from the transcript
- "asset"       : ticker or asset name if relevant, else null
- "direction"   : "bullish" | "bearish" | "neutral" | null
- "timestamp"   : [HH:MM:SS] string from transcript
- "timestamp_secs": integer seconds

Return a JSON array. Return [] if the experts say nothing notable.
Only include statements from the listed experts — ignore other speakers.
Focus on: market calls, stock/asset picks, macro predictions, strong opinions on companies, sectors, or technology."""

def extract_calls(transcript, expert_names, video_title, video_id):
    if not ANTHROPIC_API_KEY:
        print("  (skipping extraction — ANTHROPIC_API_KEY not set)", file=sys.stderr)
        return []
    try:
        import anthropic
    except ImportError:
        print("  (skipping extraction — anthropic package not installed)", file=sys.stderr)
        return []

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    names_str = ", ".join(expert_names)

    try:
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content":
                f"Experts to track: {names_str}\nVideo: {video_title}\n\nTranscript:\n{transcript}"}],
        )
        raw = resp.content[0].text.strip()
        m = re.search(r'\[.*\]', raw, re.DOTALL)
        if not m:
            return []
        calls = json.loads(m.group(0))
        for c in calls:
            secs = c.get("timestamp_secs") or 0
            c["video_url"]   = f"https://youtu.be/{video_id}?t={secs}"
            c["video_title"] = video_title
            c["video_id"]    = video_id
        return calls
    except Exception as e:
        print(f"  Claude error: {e}", file=sys.stderr)
        return []

# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------

def send_email(subject, html_body, text_body):
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    to_addr   = CONFIG.get("notify_email", "")
    from_addr = CONFIG.get("notify_from_email", "") or to_addr
    host      = CONFIG.get("smtp_host", "smtp.gmail.com")
    port      = int(CONFIG.get("smtp_port", 587))
    user      = CONFIG.get("smtp_user", "") or from_addr
    password  = CONFIG.get("smtp_password", "")

    if not to_addr or not password:
        print("  (email not configured — check config.json)")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = from_addr
    msg["To"]      = to_addr
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(host, port) as s:
        s.starttls()
        s.login(user, password)
        s.sendmail(from_addr, [to_addr], msg.as_string())
    print(f"  Email sent to {to_addr}")

def dashboard_url(speaker=None, search=None, topic=None):
    from urllib.parse import urlencode, quote
    params = {}
    if speaker: params["speaker"] = speaker
    if search:  params["search"]  = search
    if topic:   params["topic"]   = topic
    qs = urlencode(params)
    return f"{DASHBOARD_URL}{'?' + qs if qs else ''}"

def format_digest(calls, run_time):
    if not calls:
        return None, None

    by_expert = {}
    for c in calls:
        by_expert.setdefault(c.get("speaker", "Unknown"), []).append(c)

    DIR  = {"bullish": "↑", "bearish": "↓", "neutral": "→"}
    DCOL = {"bullish": "#22c55e", "bearish": "#ef4444", "neutral": "#94a3b8"}

    # ── Plain text ──────────────────────────────────────────────────────────
    txt_lines = [f"Expert Tracker — {run_time}", f"{len(calls)} new call(s)",
                 f"Dashboard: {dashboard_url()}\n"]
    for expert, ecalls in by_expert.items():
        txt_lines.append(f"── {expert}  {dashboard_url(speaker=expert)}")
        for c in ecalls:
            arrow = DIR.get(c.get("direction"), "•")
            asset = f" ${c['asset']}" if c.get("asset") else ""
            txt_lines.append(f"{arrow}{asset}  {c['summary']}")
            txt_lines.append(f"   ↳ {c['video_title']}")
            txt_lines.append(f"   Clip:      {c['video_url']}")
            if c.get("asset"):
                txt_lines.append(f"   Dashboard: {dashboard_url(search=c['asset'])}")
        txt_lines.append("")
    text = "\n".join(txt_lines).strip()

    # ── HTML ────────────────────────────────────────────────────────────────
    rows = []
    for expert, ecalls in by_expert.items():
        expert_dash = dashboard_url(speaker=expert)
        rows.append(f"""
        <tr>
          <td colspan="2" style="padding:20px 0 6px;border-top:1px solid #2d2d2d;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;font-weight:700;color:#94a3b8;
                    text-transform:uppercase;letter-spacing:.08em;">
                  {expert}
                </td>
                <td align="right">
                  <a href="{expert_dash}"
                     style="font-size:11px;color:#38bdf8;text-decoration:none;
                            background:#38bdf820;border:1px solid #38bdf840;
                            border-radius:20px;padding:3px 10px;white-space:nowrap;">
                    Open in dashboard →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>""")

        for c in ecalls:
            arrow = DIR.get(c.get("direction"), "•")
            color = DCOL.get(c.get("direction"), "#94a3b8")
            asset_html = ""
            asset_dash_btn = ""
            if c.get("asset"):
                asset_html = f'<span style="font-weight:700;color:{color};">${c["asset"]}</span> '
                asset_dash = dashboard_url(search=c["asset"])
                asset_dash_btn = f"""
                  <a href="{asset_dash}"
                     style="font-size:11px;color:#a78bfa;text-decoration:none;
                            background:#a78bfa20;border:1px solid #a78bfa40;
                            border-radius:20px;padding:3px 10px;margin-left:6px;white-space:nowrap;">
                    ${c['asset']} in dashboard
                  </a>"""

            rows.append(f"""
        <tr>
          <td style="padding:10px 12px 10px 0;vertical-align:top;width:28px;
              font-size:18px;color:{color};">{arrow}</td>
          <td style="padding:10px 0;">
            <div style="font-size:14px;color:#f1f5f9;line-height:1.5;">
              {asset_html}{c['summary']}
            </div>
            <div style="font-size:12px;color:#64748b;margin-top:3px;">
              {c.get('type','').replace('_',' ').title()}
              {' · <em>' + c['quote'][:120] + '…</em>' if c.get('quote') else ''}
            </div>
            <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
              <a href="{c['video_url']}"
                 style="font-size:11px;color:#38bdf8;text-decoration:none;
                        background:#38bdf820;border:1px solid #38bdf840;
                        border-radius:20px;padding:3px 10px;white-space:nowrap;">
                ▶ Watch clip
              </a>{asset_dash_btn}
            </div>
            <div style="font-size:11px;color:#475569;margin-top:4px;">
              {c['video_title'][:70]}{'…' if len(c['video_title'])>70 else ''}
            </div>
          </td>
        </tr>""")

    open_dashboard_btn = f"""
        <a href="{dashboard_url()}"
           style="display:inline-block;padding:10px 24px;background:#38bdf8;
                  color:#000;font-weight:700;font-size:13px;text-decoration:none;
                  border-radius:24px;">
          Open Dashboard
        </a>"""

    html = f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#161616;border-radius:16px;border:1px solid #2d2d2d;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="padding:24px 28px 20px;border-bottom:1px solid #2d2d2d;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;
                letter-spacing:.1em;margin-bottom:6px;">Expert Tracker</div>
            <div style="font-size:22px;font-weight:700;color:#f1f5f9;margin-bottom:4px;">
              {len(calls)} New Call{'s' if len(calls)!=1 else ''}
            </div>
            <div style="font-size:12px;color:#64748b;margin-bottom:16px;">{run_time}</div>
            {open_dashboard_btn}
          </td>
        </tr>

        <!-- Calls -->
        <tr>
          <td style="padding:8px 28px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              {''.join(rows)}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:14px 28px;border-top:1px solid #2d2d2d;
              font-size:11px;color:#475569;text-align:center;">
            i-m-all-in expert tracker &nbsp;·&nbsp; {run_time}
            &nbsp;·&nbsp;
            <a href="{dashboard_url()}" style="color:#38bdf8;text-decoration:none;">
              {DASHBOARD_URL}
            </a>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

    return html, text

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def init_seen():
    """Seed state with all videos already in our episode files so first real run is clean."""
    seen = set()
    for fname in KNOWN_EPISODE_FILES:
        p = BASE_DIR / fname
        if p.exists():
            eps = json.loads(p.read_text())
            for e in eps:
                seen.add(e["video_id"])
    # Also add any VTTs already downloaded
    for vtt in TRANSCRIPTS.glob("*.en.vtt"):
        seen.add(vtt.stem.replace(".en", ""))
    state = {"seen": list(seen), "last_run": None}
    save_state(state)
    print(f"Initialised: {len(seen)} existing videos marked as seen.")

def run(dry_run=False):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Watcher starting...")
    experts = json.loads(EXPERTS_FILE.read_text())
    state   = load_state()
    seen    = set(state.get("seen", []))

    all_calls   = []
    newly_seen  = []

    # ── 1. Own channels & known podcasts ────────────────────────────────────
    # Collect unique channel URLs → which experts to extract for each
    channel_experts = {}
    for exp in experts:
        urls = set(exp.get("own_channels", []) + exp.get("known_podcasts", []))
        for url in urls:
            channel_experts.setdefault(url, set()).add(exp["name"])

    for channel_url, expert_names in channel_experts.items():
        print(f"  Channel: {channel_url.split('@')[-1]}")
        try:
            videos = latest_from_channel(channel_url, limit=5)
        except Exception as e:
            print(f"    Error fetching: {e}", file=sys.stderr)
            continue

        for v in videos:
            vid = v["video_id"]
            if vid in seen:
                continue
            print(f"    New: {v['title'][:70]}")
            newly_seen.append(vid)

            if v["duration_seconds"] < 300:  # skip shorts / clips < 5 min
                continue

            vtt = download_transcript(vid)
            if not vtt:
                continue

            segs  = parse_vtt(vtt)
            trans = transcript_text(segs)

            # Use multi-expert list if this is a known group channel
            names = list(MULTI_EXPERT_CHANNELS.get(channel_url, expert_names))
            calls = extract_calls(trans, names, v["title"], vid)
            all_calls.extend(calls)

    # ── 2. Search YouTube for appearances on external channels ──────────────
    # Dedupe: collect unique (search_term → expert_name), skip channels already checked
    already_checked_channels = set(channel_experts.keys())
    searches = {}
    for exp in experts:
        for term in exp.get("search_terms", []):
            searches[term] = exp["name"]

    for query, expert_name in searches.items():
        print(f"  Searching: {query}")
        try:
            videos = search_youtube(query, limit=5)
        except Exception as e:
            print(f"    Error searching: {e}", file=sys.stderr)
            continue

        for v in videos:
            vid = v["video_id"]
            if vid in seen:
                continue
            # Skip if from a channel we already polled directly
            if any(v["channel_url"] and ch in v["channel_url"]
                   for ch in already_checked_channels):
                newly_seen.append(vid)
                continue

            print(f"    Found: {v['title'][:60]}  [{v.get('channel_name','')}]")
            newly_seen.append(vid)

            if v["duration_seconds"] < 300:
                continue

            vtt = download_transcript(vid)
            if not vtt:
                continue

            segs  = parse_vtt(vtt)
            trans = transcript_text(segs)
            calls = extract_calls(trans, [expert_name], v["title"], vid)
            all_calls.extend(calls)

    # ── 3. Persist state ────────────────────────────────────────────────────
    state["seen"]     = list(seen | set(newly_seen))
    state["last_run"] = datetime.now().isoformat()
    if not dry_run:
        save_state(state)

    # ── 4. Notify ────────────────────────────────────────────────────────────
    run_time = datetime.now().strftime("%b %d %Y, %I:%M %p")
    html, text = format_digest(all_calls, run_time)

    if html:
        print(f"\n{text}\n")
        if not dry_run:
            subject = f"Expert Tracker — {len(all_calls)} new call{'s' if len(all_calls)!=1 else ''} · {run_time}"
            send_email(subject, html, text)
    else:
        print("No new notable calls found.")

    print(f"Done. {len(all_calls)} call(s) from {len(newly_seen)} new video(s).")

if __name__ == "__main__":
    args = sys.argv[1:]
    if "--init" in args:
        init_seen()
    elif "--test" in args:
        run(dry_run=True)
    else:
        run()
