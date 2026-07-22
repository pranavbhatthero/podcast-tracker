import type { Prediction } from "../types";

export const BULLISH = ["up", "bullish", "buy", "long"];
export const BEARISH  = ["down", "bearish", "sell", "short"];
export const DIRECTIONAL = [...BULLISH, ...BEARISH];

export interface ConsensusTicker {
  ticker: string;
  label: string;
  bullish: Prediction[];
  bearish: Prediction[];
  experts: string[];
  latestDate: string;
  priceTicker: string | null;
  daysSince: number;
}

export function daysSinceDate(dateStr: string, now = Date.now()): number {
  return Math.floor((now - new Date(dateStr).getTime()) / 86400000);
}

export function consensusStrength(c: ConsensusTicker): number {
  const total = c.bullish.length + c.bearish.length;
  if (total === 0) return 0;
  const majority = Math.max(c.bullish.length, c.bearish.length);
  const agreement = majority / total;
  const recency = Math.max(0, 1 - c.daysSince / 365);
  return c.experts.length * agreement * recency;
}

export function buildConsensusMap(
  predictions: Prediction[],
  minExperts = 2,
  now = Date.now()
): ConsensusTicker[] {
  const map = new Map<string, ConsensusTicker>();

  for (const p of predictions) {
    if (!DIRECTIONAL.includes(p.direction)) continue;
    const key = p.price_ticker ?? p.ticker_or_name?.toLowerCase();
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, {
        ticker: key,
        label: p.ticker_or_name,
        bullish: [],
        bearish: [],
        experts: [],
        latestDate: p.episode_date,
        priceTicker: p.price_ticker ?? null,
        daysSince: 0,
      });
    }

    const c = map.get(key)!;
    if (BULLISH.includes(p.direction)) c.bullish.push(p);
    else c.bearish.push(p);

    if (!c.experts.includes(p.speaker)) c.experts.push(p.speaker);
    if (p.episode_date > c.latestDate) c.latestDate = p.episode_date;
  }

  for (const c of map.values()) {
    c.daysSince = daysSinceDate(c.latestDate, now);
  }

  return [...map.values()]
    .filter((c) => c.experts.length >= minExperts)
    .sort((a, b) => consensusStrength(b) - consensusStrength(a));
}
