"use client";

import type { Prediction } from "../types";

const speakerColors: Record<string, string> = {
  Chamath: "bg-violet-500",
  Sacks: "bg-sky-500",
  Friedberg: "bg-emerald-500",
  Jason: "bg-orange-500",
};

const speakerInitials: Record<string, string> = {
  Chamath: "C",
  Sacks: "S",
  Friedberg: "F",
  Jason: "J",
};

const directionConfig: Record<
  string,
  { label: string; bg: string; text: string; dot: string }
> = {
  up: { label: "↑ Up", bg: "bg-emerald-950/60", text: "text-emerald-400", dot: "bg-emerald-400" },
  bullish: { label: "↑ Bullish", bg: "bg-emerald-950/60", text: "text-emerald-400", dot: "bg-emerald-400" },
  buy: { label: "↑ Buy", bg: "bg-emerald-950/60", text: "text-emerald-400", dot: "bg-emerald-400" },
  down: { label: "↓ Down", bg: "bg-red-950/60", text: "text-red-400", dot: "bg-red-400" },
  bearish: { label: "↓ Bearish", bg: "bg-red-950/60", text: "text-red-400", dot: "bg-red-400" },
  sell: { label: "↓ Sell", bg: "bg-red-950/60", text: "text-red-400", dot: "bg-red-400" },
  hold: { label: "→ Hold", bg: "bg-gray-800", text: "text-gray-400", dot: "bg-gray-400" },
  neutral: { label: "→ Neutral", bg: "bg-gray-800", text: "text-gray-400", dot: "bg-gray-400" },
};

const assetTypeColors: Record<string, string> = {
  stock: "text-blue-300 bg-blue-950/50 border-blue-800/50",
  commodity: "text-amber-300 bg-amber-950/50 border-amber-800/50",
  crypto: "text-purple-300 bg-purple-950/50 border-purple-800/50",
  sector: "text-cyan-300 bg-cyan-950/50 border-cyan-800/50",
  macro: "text-pink-300 bg-pink-950/50 border-pink-800/50",
  other: "text-gray-300 bg-gray-800/50 border-gray-700/50",
  etf: "text-indigo-300 bg-indigo-950/50 border-indigo-800/50",
};

const confidenceDots: Record<string, number> = { high: 3, medium: 2, low: 1 };

export default function PredictionCard({ prediction: p }: { prediction: Prediction }) {
  const dir = directionConfig[p.direction] ?? directionConfig.neutral;
  const assetStyle =
    assetTypeColors[p.asset_type] ?? assetTypeColors.other;
  const dotCount = confidenceDots[p.confidence] ?? 1;
  const color = speakerColors[p.speaker] ?? "bg-gray-500";
  const initials = speakerInitials[p.speaker] ?? p.speaker[0];

  const isContrarian = p.prediction.startsWith("[CONTRARIAN]");
  const displayPrediction = isContrarian
    ? p.prediction.replace("[CONTRARIAN] ", "")
    : p.prediction;

  return (
    <div className="group relative flex flex-col bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-600 transition-all hover:shadow-xl hover:shadow-black/40">
      {isContrarian && (
        <div className="absolute top-3 right-3 z-10">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
            CONTRARIAN
          </span>
        </div>
      )}

      {/* Card top: speaker + direction */}
      <div className={`px-4 pt-4 pb-3 flex items-start justify-between gap-2 ${dir.bg}`}>
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-xs font-bold flex-shrink-0`}
          >
            {initials}
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">{p.speaker}</div>
            <div className="text-xs text-gray-400">{p.episode_date}</div>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 ${dir.text} text-sm font-semibold`}>
          <div className={`w-1.5 h-1.5 rounded-full ${dir.dot} animate-pulse`} />
          {dir.label}
        </div>
      </div>

      {/* Ticker + asset type */}
      <div className="px-4 pt-3 flex items-center gap-2 flex-wrap">
        <span className="text-base font-bold text-white truncate max-w-[200px]">
          {p.ticker_or_name}
        </span>
        <span
          className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${assetStyle}`}
        >
          {p.asset_type}
        </span>
        {p.timeframe && p.timeframe !== "2026" && (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium border border-gray-700 text-gray-400 bg-gray-800">
            {p.timeframe}
          </span>
        )}
      </div>

      {/* Prediction text */}
      <div className="px-4 pt-2 pb-3 flex-1">
        <p className="text-sm text-gray-300 leading-relaxed line-clamp-4">
          {displayPrediction}
        </p>
      </div>

      {/* Footer: timestamp + confidence + watch link */}
      <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {/* Confidence dots */}
          <div className="flex items-center gap-1">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={`w-1.5 h-1.5 rounded-full ${
                  n <= dotCount ? "bg-violet-400" : "bg-gray-700"
                }`}
              />
            ))}
            <span className="text-xs text-gray-500 ml-1">{p.confidence}</span>
          </div>

          {/* Timestamp badge */}
          <span className="text-xs text-gray-500 font-mono">{p.timestamp}</span>
        </div>

        {/* Watch link */}
        <a
          href={p.video_link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/15 border border-red-600/30 text-red-400 text-xs font-medium hover:bg-red-600/25 hover:text-red-300 transition-all"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.66a8.27 8.27 0 004.83 1.56V6.78a4.84 4.84 0 01-1.06-.09z" />
          </svg>
          Watch
        </a>
      </div>
    </div>
  );
}
