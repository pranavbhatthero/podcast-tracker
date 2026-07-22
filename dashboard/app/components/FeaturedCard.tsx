"use client";

import type { Prediction } from "../types";
import type { PriceData } from "../api/prices/route";
import { PriceBlock } from "./PriceBlock";

const speakerColors: Record<string, string> = {
  Chamath: "#a78bfa",
  Sacks: "#38bdf8",
  Friedberg: "#34d399",
  Jason: "#fb923c",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const speakerInitials: Record<string, string> = {
  Chamath: "C",
  Sacks: "S",
  Friedberg: "F",
  Jason: "J",
};

export default function FeaturedCard({ prediction: p, priceData }: { prediction: Prediction; priceData?: PriceData }) {
  const isBullish = ["up", "bullish", "buy"].includes(p.direction);
  const isBearish = ["down", "bearish", "sell"].includes(p.direction);
  const isContrarian = p.prediction.startsWith("[CONTRARIAN]");
  const clean = p.prediction.replace("[CONTRARIAN] ", "");
  const color = speakerColors[p.speaker] ?? "#9ca3af";
  const confDots = p.confidence === "high" ? 3 : p.confidence === "medium" ? 2 : 1;

  return (
    <div className="bg-[#161616] rounded-2xl border border-white/[0.07] overflow-hidden hover:border-white/[0.13] transition-colors">
      {/* Color bar */}
      <div className="h-px" style={{ background: `linear-gradient(90deg, ${color}60, transparent)` }} />

      <div className="p-5">
        {/* Source row */}
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
            style={{ background: `${color}25`, color }}
          >
            {speakerInitials[p.speaker] ?? p.speaker[0]}
          </div>
          <span className="text-xs font-semibold" style={{ color }}>{p.speaker}</span>
          <span className="text-white/15 text-xs">·</span>
          <a
            href={p.episode_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-white/40 hover:text-white/70 transition-colors truncate max-w-[220px]"
          >
            {p.episode_title}
          </a>
          <span className="text-white/15 text-xs">·</span>
          <span className="text-xs text-white/25 flex-shrink-0">{fmtDate(p.episode_date)}</span>
          {p.source === "external" && p.source_name && (
            <>
              <span className="text-white/15 text-xs">·</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-400/10 text-blue-400 border border-blue-400/20">
                {p.source_name}
              </span>
            </>
          )}
          {isContrarian && (
            <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">
              CONTRARIAN
            </span>
          )}
        </div>

        {/* Ticker headline */}
        <h2 className="text-2xl font-bold text-white leading-tight mb-3">{p.ticker_or_name}</h2>

        {/* Pills */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            isBullish ? "bg-emerald-400/10 text-emerald-400"
            : isBearish ? "bg-red-400/10 text-red-400"
            : "bg-white/[0.07] text-white/50"
          }`}>
            {isBullish ? "↑" : isBearish ? "↓" : "→"} {p.direction}
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/[0.06] text-white/50">
            {p.asset_type}
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/[0.06] text-white/50">
            {p.timeframe}
          </span>
        </div>

        {/* Full prediction */}
        <p className="text-sm text-white/75 leading-relaxed mb-4">{clean}</p>

        {/* Price row */}
        {p.price_ticker && (
          <div className="mb-4 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <PriceBlock data={priceData} ticker={p.price_ticker} tickerLabel={p.ticker_or_name} episodeDate={p.episode_date} />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/25 font-mono">{p.timestamp}</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: n <= confDots ? color : "rgba(255,255,255,0.1)" }}
                />
              ))}
              <span className="text-xs text-white/25 ml-1">{p.confidence}</span>
            </div>
          </div>

          <a
            href={p.video_link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all hover:opacity-80"
            style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            Watch clip
          </a>
        </div>
      </div>
    </div>
  );
}
