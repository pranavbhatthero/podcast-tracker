"use client";

import type { Prediction } from "../types";
import type { PriceData } from "../api/prices/route";
import { PriceBlock } from "./PriceBlock";
import { useWatchlist } from "../hooks/useWatchlist";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const speakerColors: Record<string, string> = {
  Chamath: "#a78bfa",
  Sacks: "#38bdf8",
  Friedberg: "#34d399",
  Jason: "#fb923c",
};

export default function NewsCard({ prediction: p, priceData }: { prediction: Prediction; priceData?: PriceData }) {
  const isBullish = ["up", "bullish", "buy"].includes(p.direction);
  const isBearish = ["down", "bearish", "sell"].includes(p.direction);
  const isContrarian = p.prediction.startsWith("[CONTRARIAN]");
  const clean = p.prediction.replace("[CONTRARIAN] ", "");
  const color = speakerColors[p.speaker] ?? "#9ca3af";
  const watchKey = p.price_ticker ?? p.ticker_or_name?.toLowerCase();
  const { isWatched, toggle } = useWatchlist();

  return (
    <div className="flex items-start gap-4 px-4 py-3.5 hover:bg-white/[0.03] transition-colors group">
      {/* Direction dot */}
      <div className={`mt-1 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
        isBullish ? "bg-emerald-400/10 text-emerald-400"
        : isBearish ? "bg-red-400/10 text-red-400"
        : "bg-white/[0.05] text-white/30"
      }`}>
        {isBullish ? "↑" : isBearish ? "↓" : "→"}
      </div>

      {/* Text block */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[11px] font-semibold" style={{ color }}>{p.speaker}</span>
          <span className="text-white/15 text-xs">·</span>
          <span className="text-[11px] text-white/45">{p.asset_type}</span>
          {p.source === "external" && p.source_name && (
            <>
              <span className="text-white/15 text-xs">·</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-400/10 text-blue-400 border border-blue-400/20 truncate max-w-[120px]">
                {p.source_name}
              </span>
            </>
          )}
          {isContrarian && (
            <>
              <span className="text-white/15 text-xs">·</span>
              <span className="text-[11px] font-semibold text-yellow-400/70">contrarian</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-sm font-semibold text-white/90 leading-snug group-hover:text-white transition-colors flex-1">
            {p.ticker_or_name}
          </p>
          {watchKey && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(watchKey); }}
              className={`flex-shrink-0 text-xs transition-colors ${isWatched(watchKey) ? "text-yellow-400" : "text-white/15 hover:text-white/40"}`}
              title={isWatched(watchKey) ? "Remove from watchlist" : "Add to watchlist"}
            >
              ★
            </button>
          )}
        </div>
        <p className="text-xs text-white/55 leading-relaxed line-clamp-2">{clean}</p>

        {p.price_ticker && (
          <div className="mt-2 mb-1">
            <PriceBlock data={priceData} compact ticker={p.price_ticker} tickerLabel={p.ticker_or_name} episodeDate={p.episode_date} />
          </div>
        )}

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <a
            href={p.episode_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-white/45 hover:text-white/70 transition-colors truncate max-w-[160px]"
          >
            {p.episode_title}
          </a>
          <span className="text-white/10">·</span>
          <span className="text-[11px] text-white/40 flex-shrink-0">{fmtDate(p.episode_date)}</span>
          <span className="text-white/20">·</span>
          <span className="text-[11px] text-white/35 font-mono flex-shrink-0">{p.timestamp}</span>
          <span className="text-white/10">·</span>
          <span className={`text-[11px] font-medium flex-shrink-0 ${
            isBullish ? "text-emerald-400/70" : isBearish ? "text-red-400/70" : "text-white/30"
          }`}>
            {p.direction}
          </span>
        </div>
      </div>

      {/* Watch */}
      <a
        href={p.video_link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 self-center px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all opacity-0 group-hover:opacity-100"
        style={{ color, borderColor: `${color}50`, background: `${color}10` }}
      >
        ▶ Watch
      </a>
    </div>
  );
}
