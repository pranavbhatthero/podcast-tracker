"use client";

import type { Prediction } from "../types";
import type { PriceMap } from "../hooks/usePrices";
import { priceKey } from "../hooks/usePrices";

const BULLISH = ["up", "bullish", "buy", "long"];
const BEARISH  = ["down", "bearish", "sell", "short"];
const DIRECTIONAL = [...BULLISH, ...BEARISH];

interface ConsensusTicker {
  ticker: string;
  label: string;
  bullish: Prediction[];
  bearish: Prediction[];
  experts: string[];
  latestDate: string;
  priceKey: string | null;
  // recency score: days since latest prediction (lower = fresher)
  daysSince: number;
}

function daysSince(dateStr: string): number {
  return Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function consensusStrength(c: ConsensusTicker): number {
  // Score = unique experts × agreement ratio × recency decay
  const total = c.bullish.length + c.bearish.length;
  if (total === 0) return 0;
  const majority = Math.max(c.bullish.length, c.bearish.length);
  const agreement = majority / total;
  const recency = Math.max(0, 1 - c.daysSince / 365);
  return c.experts.length * agreement * recency;
}

export default function ConsensusView({
  predictions,
  prices,
  onSpeakerClick,
}: {
  predictions: Prediction[];
  prices: PriceMap;
  onSpeakerClick: (speaker: string) => void;
}) {
  // Group directional predictions by price_ticker (or ticker_or_name if no ticker)
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
        priceKey: p.price_ticker ?? null,
        daysSince: 0,
      });
    }

    const c = map.get(key)!;
    if (BULLISH.includes(p.direction)) c.bullish.push(p);
    else c.bearish.push(p);

    if (!c.experts.includes(p.speaker)) c.experts.push(p.speaker);
    if (p.episode_date > c.latestDate) c.latestDate = p.episode_date;
  }

  // Compute daysSince for each
  for (const c of map.values()) {
    c.daysSince = daysSince(c.latestDate);
  }

  // Only show tickers with 2+ unique experts
  const consensus = [...map.values()]
    .filter((c) => c.experts.length >= 2)
    .sort((a, b) => consensusStrength(b) - consensusStrength(a));

  if (consensus.length === 0) {
    return (
      <div className="text-center py-24 text-white/25 text-sm">
        No consensus signals found (need 2+ experts on same ticker).
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-white/25 mb-4">
        Tickers with calls from 2+ experts — sorted by conviction strength (unique experts × agreement × recency)
      </p>
      {consensus.map((c) => {
        const total = c.bullish.length + c.bearish.length;
        const isBullish = c.bullish.length >= c.bearish.length;
        const majority = Math.max(c.bullish.length, c.bearish.length);
        const pct = Math.round((majority / total) * 100);
        const priceData = c.priceKey ? prices[priceKey(c.priceKey, c.latestDate)] : null;
        const pctChange = priceData?.pctChange;

        return (
          <div
            key={c.ticker}
            className="bg-[#161616] rounded-2xl border border-white/[0.07] p-4 hover:border-white/[0.13] transition-colors"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-white">{c.label}</span>
                  {c.priceKey && (
                    <span className="text-xs text-white/30 font-mono">{c.priceKey}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs font-bold ${isBullish ? "text-emerald-400" : "text-red-400"}`}>
                    {isBullish ? "↑ BULLISH" : "↓ BEARISH"} CONSENSUS
                  </span>
                  <span className="text-xs text-white/25">{pct}% agreement</span>
                  <span className="text-white/15 text-xs">·</span>
                  <span className="text-xs text-white/25">
                    {c.daysSince === 0 ? "today" : c.daysSince === 1 ? "yesterday" : `${c.daysSince}d ago`}
                  </span>
                </div>
              </div>

              {/* Price performance */}
              {pctChange != null && (
                <div className={`text-right flex-shrink-0 ${pctChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  <div className="text-lg font-bold tabular-nums">
                    {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-white/25">since latest call</div>
                </div>
              )}
            </div>

            {/* Conviction bar */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isBullish ? "bg-emerald-400" : "bg-red-400"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] text-white/30 flex-shrink-0 font-mono">
                {c.bullish.length}↑ {c.bearish.length}↓
              </span>
            </div>

            {/* Expert avatars */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-white/25 mr-1">Called by:</span>
              {c.experts.slice(0, 8).map((speaker) => {
                const bullCalls = c.bullish.filter(p => p.speaker === speaker).length;
                const bearCalls = c.bearish.filter(p => p.speaker === speaker).length;
                const spkDir = bullCalls >= bearCalls ? "bull" : "bear";
                return (
                  <button
                    key={speaker}
                    onClick={() => onSpeakerClick(speaker)}
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full border transition-all hover:opacity-80 ${
                      spkDir === "bull"
                        ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
                        : "bg-red-400/10 text-red-400 border-red-400/20"
                    }`}
                  >
                    {speaker.split(" ").pop()} {spkDir === "bull" ? "↑" : "↓"}
                  </button>
                );
              })}
              {c.experts.length > 8 && (
                <span className="text-[10px] text-white/20">+{c.experts.length - 8} more</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
