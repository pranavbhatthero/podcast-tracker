"use client";

import type { Prediction } from "../types";
import type { PriceMap } from "../hooks/usePrices";
import { priceKey } from "../hooks/usePrices";
import { useWatchlist } from "../hooks/useWatchlist";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function WatchlistPanel({
  predictions,
  prices,
}: {
  predictions: Prediction[];
  prices: PriceMap;
}) {
  const { watchlist, toggle } = useWatchlist();

  const watched = [...watchlist].map((ticker) => {
    const calls = predictions.filter(
      (p) => (p.price_ticker?.toLowerCase() === ticker.toLowerCase() ||
               p.ticker_or_name?.toLowerCase() === ticker.toLowerCase())
    ).sort((a, b) => b.episode_date.localeCompare(a.episode_date));
    const latest = calls[0];
    const priceData = latest?.price_ticker ? prices[priceKey(latest.price_ticker, latest.episode_date)] : null;
    return { ticker, calls, latest, priceData };
  }).filter((w) => w.calls.length > 0);

  if (watchlist.size === 0) {
    return (
      <div className="bg-[#161616] rounded-2xl border border-white/[0.07] p-5 text-center">
        <div className="text-white/25 text-sm mb-2">No tickers on watchlist</div>
        <div className="text-white/15 text-xs">Click the ★ next to any ticker to watch it</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {watched.map(({ ticker, calls, latest, priceData }) => {
        const isBullish = latest && ["up", "bullish", "buy", "long"].includes(latest.direction);
        const isBearish = latest && ["down", "bearish", "sell", "short"].includes(latest.direction);
        const pctChange = priceData?.pctChange;

        return (
          <div key={ticker} className="bg-[#161616] rounded-2xl border border-white/[0.07] p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{latest?.ticker_or_name ?? ticker}</span>
                {ticker !== latest?.ticker_or_name && (
                  <span className="text-[10px] text-white/30 font-mono">{ticker.toUpperCase()}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {pctChange != null && (
                  <span className={`text-sm font-bold tabular-nums ${pctChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
                  </span>
                )}
                <button
                  onClick={() => toggle(ticker)}
                  className="text-yellow-400 hover:text-yellow-300 transition-colors text-sm"
                  title="Remove from watchlist"
                >
                  ★
                </button>
              </div>
            </div>

            <div className="text-xs text-white/40 mb-2">
              {calls.length} call{calls.length !== 1 ? "s" : ""} ·{" "}
              {isBullish ? (
                <span className="text-emerald-400">↑ bullish</span>
              ) : isBearish ? (
                <span className="text-red-400">↓ bearish</span>
              ) : null}
              {latest && <span> · last {fmtDate(latest.episode_date)}</span>}
            </div>

            {/* Latest prediction snippet */}
            {latest && (
              <p className="text-xs text-white/55 line-clamp-2 leading-relaxed">
                {latest.prediction.replace("[CONTRARIAN] ", "")}
              </p>
            )}

            {/* Speakers who called it */}
            <div className="flex flex-wrap gap-1 mt-2">
              {[...new Set(calls.map((p) => p.speaker))].slice(0, 5).map((spk) => (
                <span key={spk} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/40">
                  {spk.split(" ").pop()}
                </span>
              ))}
            </div>
          </div>
        );
      })}

      {watched.length < watchlist.size && (
        <div className="text-[11px] text-white/20 text-center">
          {watchlist.size - watched.length} watched ticker{watchlist.size - watched.length !== 1 ? "s" : ""} have no predictions yet
        </div>
      )}
    </div>
  );
}
