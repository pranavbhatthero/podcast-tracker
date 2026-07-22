/**
 * Parses a timestamp string to total seconds.
 * Handles standard HH:MM:SS and malformed HH:MM:SSS (3-digit seconds from yt-dlp).
 */
export function tsToSecs(ts: string): number {
  const clean = ts.replace(/[[\]]/g, "").trim();
  const parts = clean.split(":").map(Number);
  if (parts.length === 3) {
    // Guard against 3-digit "seconds" like "279" — clamp to 0–59
    const secs = parts[2] > 59 ? 0 : parts[2];
    return parts[0] * 3600 + parts[1] * 60 + secs;
  }
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

export function secsToTs(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
