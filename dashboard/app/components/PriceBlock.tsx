"use client";

import { useState } from "react";
import type { PriceData } from "../api/prices/route";
import dynamic from "next/dynamic";

const ChartModal = dynamic(() => import("./ChartModal"), { ssr: false });

function fmt(n: number, currency: string) {
  if (currency === "USD" || !currency) {
    return n >= 1000
      ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 })
      : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " " + currency;
}

function Sparkline({
  data,
  positive,
  onClick,
}: {
  data: number[];
  positive: boolean;
  onClick?: () => void;
}) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 80;
  const H = 28;

  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((v - min) / range) * (H * 0.85) - H * 0.075;
      return `${x},${y}`;
    })
    .join(" ");

  const color = positive ? "#34d399" : "#f87171";
  const uid = `fill-${positive ? "g" : "r"}-${Math.random().toString(36).slice(2, 6)}`;

  return (
    <button
      onClick={onClick}
      title="View full chart"
      className="group relative flex items-center rounded-md overflow-hidden transition-all hover:scale-105 active:scale-95"
      style={{ width: W, height: H }}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`url(#${uid})`} />
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      {/* hover overlay hint */}
      <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[9px] font-semibold text-white bg-black/60 rounded px-1 py-0.5 backdrop-blur-sm">
          expand
        </span>
      </span>
    </button>
  );
}

export function PriceBlock({
  data,
  compact = false,
  ticker,
  tickerLabel,
  episodeDate,
}: {
  data?: PriceData;
  compact?: boolean;
  ticker?: string;
  tickerLabel?: string;
  episodeDate?: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  if (!data) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-white/20 animate-pulse">Loading price…</span>
      </div>
    );
  }

  if (!data.priceAtEpisode || !data.priceNow) {
    return <span className="text-xs text-white/20">No price data</span>;
  }

  const positive = (data.pctChange ?? 0) >= 0;
  const pctColor = positive ? "text-emerald-400" : "text-red-400";
  const pctBg = positive ? "bg-emerald-400/10" : "bg-red-400/10";

  const openModal = ticker ? () => setModalOpen(true) : undefined;

  return (
    <>
      {modalOpen && ticker && (
        <ChartModal
          ticker={ticker}
          tickerLabel={tickerLabel ?? ticker}
          episodeDate={episodeDate}
          onClose={() => setModalOpen(false)}
        />
      )}

      {compact ? (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-white/30">was</span>
            <span className="text-[11px] text-white/50 font-mono">{fmt(data.priceAtEpisode, data.currency)}</span>
          </div>
          <span className="text-white/10">→</span>
          <span className="text-[11px] text-white/50 font-mono font-semibold">{fmt(data.priceNow, data.currency)}</span>
          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${pctBg} ${pctColor}`}>
            {positive ? "+" : ""}{data.pctChange}%
          </span>
          <Sparkline data={data.sparkline} positive={positive} onClick={openModal} />
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <div className="text-[10px] text-white/25 uppercase tracking-wide mb-0.5">At episode</div>
            <div className="text-sm font-mono text-white/60">{fmt(data.priceAtEpisode, data.currency)}</div>
          </div>
          <div className="text-white/15 text-lg">→</div>
          <div>
            <div className="text-[10px] text-white/25 uppercase tracking-wide mb-0.5">Now</div>
            <div className="text-sm font-mono text-white font-semibold">{fmt(data.priceNow, data.currency)}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/25 uppercase tracking-wide mb-0.5">Change</div>
            <div className={`text-sm font-bold ${pctColor}`}>{positive ? "+" : ""}{data.pctChange}%</div>
          </div>
          <div className="ml-auto">
            <Sparkline data={data.sparkline} positive={positive} onClick={openModal} />
          </div>
        </div>
      )}
    </>
  );
}
