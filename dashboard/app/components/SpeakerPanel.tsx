"use client";

import { useEffect, useRef, useState } from "react";
import type { Prediction } from "../types";
import type { Expert } from "../types/expert";
import type { PriceMap } from "../hooks/usePrices";
import { priceKey } from "../hooks/usePrices";
import { PriceBlock } from "./PriceBlock";
import { buildTrackRecord } from "../lib/trackRecord";

const DIRECTIONAL = ["up", "bullish", "buy", "long", "down", "bearish", "sell", "short"];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function dirAdj(direction: string, pctChange: number) {
  return ["up", "bullish", "buy", "long"].includes(direction) ? pctChange : -pctChange;
}

function isCorrect(direction: string, pctChange: number) {
  const bull = ["up", "bullish", "buy", "long"].includes(direction);
  return bull ? pctChange > 0 : pctChange < 0;
}

function OutcomeBadge({ direction, pctChange }: { direction: string; pctChange: number | null }) {
  if (pctChange == null) return null;
  if (!DIRECTIONAL.includes(direction)) return null;
  const correct = isCorrect(direction, pctChange);
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
      correct
        ? "bg-emerald-400/15 text-emerald-400 border border-emerald-400/20"
        : "bg-red-400/15 text-red-400 border border-red-400/20"
    }`}>
      {correct ? "✓" : "✗"} {correct ? "CORRECT" : "WRONG"}
    </span>
  );
}

// Single call card — reused inside both scored groups and unscored groups
function CallCard({ p, priceData, color, scored }: {
  p: Prediction;
  priceData?: PriceMap[string];
  color: string;
  scored: boolean;
}) {
  const isBullish = ["up", "bullish", "buy", "long"].includes(p.direction);
  const isBearish = ["down", "bearish", "sell", "short"].includes(p.direction);
  const clean = p.prediction.replace("[CONTRARIAN] ", "");

  return (
    <div className="px-5 py-3.5 hover:bg-white/[0.02] transition-colors border-l-2 ml-4" style={{ borderLeftColor: `${color}30` }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-xs font-bold ${isBullish ? "text-emerald-400" : isBearish ? "text-red-400" : "text-white/40"}`}>
          {isBullish ? "↑" : isBearish ? "↓" : "→"} {p.direction}
        </span>
        {scored && <OutcomeBadge direction={p.direction} pctChange={priceData?.pctChange ?? null} />}
        <span className="ml-auto text-[10px] text-white/25 flex-shrink-0 font-mono">{fmtDate(p.episode_date)}</span>
      </div>

      <p className="text-xs text-white/65 leading-relaxed mb-2.5 line-clamp-3">{clean}</p>

      {scored && priceData && (
        <div className="mb-2.5">
          <PriceBlock data={priceData} compact ticker={p.price_ticker} tickerLabel={p.ticker_or_name} episodeDate={p.episode_date} />
        </div>
      )}

      <div className="flex items-center gap-2">
        <a href={p.episode_url} target="_blank" rel="noopener noreferrer"
          className="text-[10px] text-white/25 hover:text-white/50 transition-colors truncate">
          {p.episode_title}
        </a>
        <a href={p.video_link} target="_blank" rel="noopener noreferrer"
          className="ml-auto flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all hover:opacity-80"
          style={{ color, background: `${color}15`, border: `1px solid ${color}30` }}>
          ▶ Watch
        </a>
      </div>
    </div>
  );
}

// Ticker group header + expandable list of calls
function TickerGroup({ ticker, label, calls, prices, color, scored, defaultOpen }: {
  ticker: string | null;
  label: string;
  calls: Prediction[];
  prices: PriceMap;
  color: string;
  scored: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Group-level stats
  const groupCorrect = scored ? calls.filter((p) => {
    const d = p.price_ticker ? prices[priceKey(p.price_ticker, p.episode_date)] : null;
    return d?.pctChange != null && DIRECTIONAL.includes(p.direction) && isCorrect(p.direction, d.pctChange);
  }).length : 0;
  const groupScored = scored ? calls.filter((p) => {
    const d = p.price_ticker ? prices[priceKey(p.price_ticker, p.episode_date)] : null;
    return d?.pctChange != null && DIRECTIONAL.includes(p.direction);
  }).length : 0;
  const groupReturns = scored ? calls.flatMap((p) => {
    const d = p.price_ticker ? prices[priceKey(p.price_ticker, p.episode_date)] : null;
    if (d?.pctChange == null || !DIRECTIONAL.includes(p.direction)) return [];
    return [dirAdj(p.direction, d.pctChange)];
  }) : [];
  const groupAvg = groupReturns.length ? groupReturns.reduce((a, b) => a + b, 0) / groupReturns.length : null;
  const groupPositive = (groupAvg ?? 0) >= 0;

  return (
    <div className="border-b border-white/[0.05] last:border-0">
      {/* Ticker header row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-3 flex items-center gap-3 hover:bg-white/[0.03] transition-colors text-left"
      >
        <span className="text-sm font-bold text-white flex-1 truncate">{label}</span>

        <span className="text-xs text-white/30 flex-shrink-0 font-mono">
          {calls.length} {calls.length === 1 ? "call" : "calls"}
        </span>

        {scored && groupScored > 0 && (
          <span className="text-xs text-white/35 flex-shrink-0 font-mono">{groupCorrect}/{groupScored}</span>
        )}

        {scored && groupAvg != null && (
          <span className={`text-xs font-bold flex-shrink-0 w-16 text-right tabular-nums ${groupPositive ? "text-emerald-400" : "text-red-400"}`}>
            {groupPositive ? "+" : ""}{groupAvg.toFixed(1)}%
          </span>
        )}

        <span className="text-white/20 text-xs flex-shrink-0 ml-1">{open ? "▲" : "▼"}</span>
      </button>

      {/* Individual calls */}
      {open && (
        <div className="pb-2 space-y-0">
          {calls.map((p, i) => {
            const priceData = p.price_ticker ? prices[priceKey(p.price_ticker, p.episode_date)] : undefined;
            return <CallCard key={i} p={p} priceData={priceData} color={color} scored={scored} />;
          })}
        </div>
      )}
    </div>
  );
}

export default function SpeakerPanel({
  speaker,
  expert,
  predictions,
  prices,
  color,
  onClose,
}: {
  speaker: string;
  expert: Expert | null;
  predictions: Prediction[];
  prices: PriceMap;
  color: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Split into scored vs unscored
  const scored = predictions.filter((p) => {
    if (!p.price_ticker) return false;
    const d = prices[priceKey(p.price_ticker, p.episode_date)];
    return d?.pctChange != null && DIRECTIONAL.includes(p.direction);
  });
  const unscored = predictions.filter((p) => {
    if (!p.price_ticker) return true;
    const d = prices[priceKey(p.price_ticker, p.episode_date)];
    return d?.pctChange == null;
  });

  const correctCount = scored.filter((p) => {
    const d = prices[priceKey(p.price_ticker!, p.episode_date)]!;
    return isCorrect(p.direction, d.pctChange!);
  }).length;
  const dirAdjReturns = scored.map((p) => {
    const d = prices[priceKey(p.price_ticker!, p.episode_date)]!;
    return dirAdj(p.direction, d.pctChange!);
  });
  const avgReturn = dirAdjReturns.length ? dirAdjReturns.reduce((a, b) => a + b, 0) / dirAdjReturns.length : null;

  // Group scored by ticker, sort groups by avg dir-adj return descending
  const scoredGroups = new Map<string, Prediction[]>();
  for (const p of scored) {
    const key = p.price_ticker!;
    if (!scoredGroups.has(key)) scoredGroups.set(key, []);
    scoredGroups.get(key)!.push(p);
  }
  // Sort each group's calls by date ascending
  for (const calls of scoredGroups.values()) {
    calls.sort((a, b) => a.episode_date.localeCompare(b.episode_date));
  }
  const sortedScoredGroups = [...scoredGroups.entries()].sort((a, b) => {
    const avg = (calls: Prediction[]) => {
      const rs = calls.flatMap((p) => {
        const d = prices[priceKey(p.price_ticker!, p.episode_date)];
        return d?.pctChange != null ? [dirAdj(p.direction, d.pctChange)] : [];
      });
      return rs.length ? rs.reduce((x, y) => x + y, 0) / rs.length : -Infinity;
    };
    return avg(b[1]) - avg(a[1]);
  });

  // Group unscored by ticker_or_name
  const unscoredGroups = new Map<string, Prediction[]>();
  for (const p of unscored) {
    const key = p.price_ticker ?? p.ticker_or_name ?? "Other";
    if (!unscoredGroups.has(key)) unscoredGroups.set(key, []);
    unscoredGroups.get(key)!.push(p);
  }
  for (const calls of unscoredGroups.values()) {
    calls.sort((a, b) => a.episode_date.localeCompare(b.episode_date));
  }

  return (
    <>
      {/* Invisible full-screen capture — closes panel on outside click */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        ref={panelRef}
        className="fixed left-0 top-0 h-full z-50 w-full max-w-3xl bg-[#0f0f0f] border-r border-white/[0.08] flex flex-col shadow-2xl"
        style={{ borderTopWidth: 2, borderTopColor: color }}
      >
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.07] flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">{speaker}</h2>
            {expert && <p className="text-xs text-white/40 mt-0.5">{expert.role}</p>}
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors text-xl leading-none mt-0.5">×</button>
        </div>
        <div className="flex items-center gap-6 mt-3">
          <div>
            <div className="text-[10px] text-white/30 uppercase tracking-wide">Total calls</div>
            <div className="text-sm font-bold text-white">{predictions.length}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/30 uppercase tracking-wide">Scored</div>
            <div className="text-sm font-bold text-white">{correctCount}/{scored.length}</div>
          </div>
          {avgReturn != null && (
            <div>
              <div className="text-[10px] text-white/30 uppercase tracking-wide">Avg return</div>
              <div className={`text-sm font-bold ${avgReturn >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {avgReturn >= 0 ? "+" : ""}{avgReturn.toFixed(1)}%
              </div>
            </div>
          )}
        </div>

        {/* Per-category track record */}
        {(() => {
          const tr = buildTrackRecord(speaker, predictions, prices);
          const cats = tr.byCategory.filter((c) => c.scored >= 2);
          if (cats.length === 0) return null;
          return (
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <div className="text-[10px] text-white/25 uppercase tracking-wide mb-2">Track record by category</div>
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => {
                  const hitPct = c.hitRate != null ? Math.round(c.hitRate * 100) : null;
                  const good = (c.hitRate ?? 0) >= 0.5;
                  return (
                    <div key={c.category} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.07]">
                      <span className="text-[10px] text-white/50 capitalize">{c.category}</span>
                      {hitPct != null && (
                        <span className={`text-[10px] font-bold ${good ? "text-emerald-400" : "text-red-400"}`}>
                          {hitPct}%
                        </span>
                      )}
                      {c.avgReturn != null && (
                        <span className={`text-[10px] font-mono ${c.avgReturn >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                          {c.avgReturn >= 0 ? "+" : ""}{c.avgReturn.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {sortedScoredGroups.length > 0 && (
          <div>
            <div className="px-5 pt-4 pb-2 flex items-center gap-3">
              <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Scored Calls</span>
              <div className="flex-1 h-px bg-white/[0.05]" />
              <span className="text-[10px] text-white/20">{sortedScoredGroups.length} ticker{sortedScoredGroups.length !== 1 ? "s" : ""}</span>
            </div>
            <div>
              {sortedScoredGroups.map(([ticker, calls], i) => (
                <TickerGroup
                  key={ticker}
                  ticker={ticker}
                  label={calls[0].ticker_or_name}
                  calls={calls}
                  prices={prices}
                  color={color}
                  scored={true}
                  defaultOpen={i < 3}
                />
              ))}
            </div>
          </div>
        )}

        {unscoredGroups.size > 0 && (
          <div>
            <div className="px-5 pt-4 pb-2 flex items-center gap-3">
              <span className="text-[10px] font-semibold text-white/20 uppercase tracking-widest">Pending / No ticker</span>
              <div className="flex-1 h-px bg-white/[0.04]" />
            </div>
            <div>
              {[...unscoredGroups.entries()].map(([key, calls]) => (
                <TickerGroup
                  key={key}
                  ticker={null}
                  label={calls[0].ticker_or_name}
                  calls={calls}
                  prices={prices}
                  color={color}
                  scored={false}
                  defaultOpen={false}
                />
              ))}
            </div>
          </div>
        )}

        {predictions.length === 0 && (
          <div className="px-5 py-12 text-center text-white/25 text-sm">No predictions found.</div>
        )}
      </div>
    </div>
    </>
  );
}
