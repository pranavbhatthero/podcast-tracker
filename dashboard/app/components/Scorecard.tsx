"use client";

import type { Prediction } from "../types";
import type { Expert } from "../types/expert";
import type { PriceMap } from "../hooks/usePrices";
import { priceKey } from "../hooks/usePrices";

const speakerColors: Record<string, string> = {
  Chamath: "#a78bfa",
  Sacks: "#38bdf8",
  Friedberg: "#34d399",
  Jason: "#fb923c",
};

function medal(rank: number) {
  if (rank === 0) return "🥇";
  if (rank === 1) return "🥈";
  if (rank === 2) return "🥉";
  return null;
}

interface SpeakerStats {
  speaker: string;
  totalCalls: number;
  scoredCalls: number;
  correct: number;
  avgReturn: number | null;
}

function isCorrect(direction: string, pctChange: number): boolean {
  const bull = ["up", "bullish", "buy", "long"].includes(direction);
  const bear = ["down", "bearish", "sell", "short"].includes(direction);
  if (bull) return pctChange > 0;
  if (bear) return pctChange < 0;
  return false;
}

export default function Scorecard({
  predictions,
  experts,
  prices,
  onSpeakerClick,
  activeSpeaker,
  panelSpeaker,
}: {
  predictions: Prediction[];
  experts: Expert[];
  prices: PriceMap;
  onSpeakerClick: (s: string) => void;
  activeSpeaker: string | null;
  panelSpeaker?: string | null;
}) {
  // Build canonical-name → all alias names map — only tracked experts
  const canonicalNames = new Map<string, Set<string>>();
  for (const expert of experts) {
    const allNames = new Set([expert.name, ...expert.aliases].map((n) => n.toLowerCase()));
    canonicalNames.set(expert.name, allNames);
  }

  const stats: SpeakerStats[] = [...canonicalNames.entries()].map(([canonicalName, aliasSet]) => {
    const calls = predictions.filter((p) => aliasSet.has(p.speaker.toLowerCase()));
    const scored = calls.filter((p) => {
      if (!p.price_ticker) return false;
      const d = prices[priceKey(p.price_ticker, p.episode_date)];
      return d?.pctChange != null;
    });

    const directionScored = scored.filter((p) =>
      ["up", "bullish", "buy", "long", "down", "bearish", "sell", "short"].includes(p.direction)
    );

    const correct = directionScored.filter((p) => {
      const d = prices[priceKey(p.price_ticker!, p.episode_date)];
      return isCorrect(p.direction, d!.pctChange!);
    }).length;

    const returns = scored.map((p) => {
      const d = prices[priceKey(p.price_ticker!, p.episode_date)];
      const bull = ["up", "bullish", "buy", "long"].includes(p.direction);
      const bear = ["down", "bearish", "sell", "short"].includes(p.direction);
      if (bull) return d!.pctChange!;
      if (bear) return -d!.pctChange!;
      return d!.pctChange!;
    });

    const avgReturn = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : null;

    return {
      speaker: canonicalName,
      totalCalls: calls.length,
      scoredCalls: directionScored.length,
      correct,
      avgReturn,
    };
  });

  const ranked = [...stats]
    .filter((s) => s.totalCalls > 0)
    .sort((a, b) => {
      if (a.avgReturn == null && b.avgReturn == null) return b.totalCalls - a.totalCalls;
      if (a.avgReturn == null) return 1;
      if (b.avgReturn == null) return -1;
      return b.avgReturn - a.avgReturn;
    });

  const pricesLoaded = Object.keys(prices).length > 0;

  return (
    <section className="bg-[#161616] rounded-2xl border border-white/[0.07] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <span className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">
          Scorecard
        </span>
      </div>
      <div className="divide-y divide-white/[0.05]">
        {ranked.map((s, i) => {
          const color = speakerColors[s.speaker] ?? "#9ca3af";
          const active = activeSpeaker === s.speaker;
          const panelOpen = panelSpeaker === s.speaker;
          const hitRate = s.scoredCalls > 0 ? Math.round((s.correct / s.scoredCalls) * 100) : null;
          const positive = (s.avgReturn ?? 0) >= 0;

          return (
            <button
              key={s.speaker}
              onClick={() => onSpeakerClick(s.speaker)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/[0.03] transition-colors text-left border-l-2"
              style={
                panelOpen
                  ? { background: `${color}12`, borderLeftColor: color }
                  : active
                  ? { background: `${color}08`, borderLeftColor: "transparent" }
                  : { borderLeftColor: "transparent" }
              }
            >
              {/* Rank */}
              <div className="w-5 flex-shrink-0 text-center">
                {medal(i) ? (
                  <span className="text-sm leading-none">{medal(i)}</span>
                ) : (
                  <span className="text-xs text-white/20 font-mono">{i + 1}</span>
                )}
              </div>

              {/* Name */}
              <span
                className="text-sm font-semibold flex-1 min-w-0 truncate"
                style={{ color: panelOpen ? color : active ? color : "rgba(255,255,255,0.85)" }}
              >
                {s.speaker}
              </span>

              {/* Hit rate */}
              {pricesLoaded && hitRate !== null && (
                <span className="text-xs text-white/35 flex-shrink-0 font-mono">
                  {s.correct}/{s.scoredCalls}
                </span>
              )}

              {/* Avg return */}
              {pricesLoaded ? (
                s.avgReturn !== null ? (
                  <span
                    className={`text-xs font-bold flex-shrink-0 w-16 text-right tabular-nums ${
                      positive ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {positive ? "+" : ""}
                    {s.avgReturn.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-xs text-white/20 flex-shrink-0 w-16 text-right">—</span>
                )
              ) : (
                <span className="text-xs text-white/20 animate-pulse flex-shrink-0 w-16 text-right">…</span>
              )}
            </button>
          );
        })}
      </div>

      {pricesLoaded && (
        <p className="px-4 py-2 text-[10px] text-white/20 border-t border-white/[0.05]">
          Avg return = direction-adjusted since episode
        </p>
      )}
    </section>
  );
}
