"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ChartResponse, ChartPoint } from "../api/chart/route";

const RANGES = ["1W", "1M", "3M", "6M", "1Y", "All"] as const;
type Range = (typeof RANGES)[number];

function fmt(n: number, currency: string) {
  if (currency === "USD") {
    return n >= 1000
      ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : "$" + n.toFixed(4).replace(/\.?0+$/, "").padEnd(n < 10 ? 6 : 4);
  }
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 }) + " " + currency;
}

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function ChartModal({
  ticker,
  tickerLabel,
  episodeDate,
  onClose,
}: {
  ticker: string;
  tickerLabel: string;
  episodeDate?: string;
  onClose: () => void;
}) {
  const [range, setRange] = useState<Range>("All");
  const [data, setData] = useState<ChartResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; point: ChartPoint } | null>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    setHover(null);
    const chartUrl = `/api/chart?ticker=${encodeURIComponent(ticker)}&range=${range}${episodeDate ? `&episodeDate=${episodeDate}` : ""}`;
    fetch(chartUrl)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [ticker, range]);

  const points = data?.points ?? [];
  const positive = points.length >= 2
    ? points[points.length - 1].close >= points[0].close
    : true;
  const accentColor = positive ? "#34d399" : "#f87171";

  // Chart dimensions
  const W = 600;
  const H = 200;
  const PAD = { top: 16, right: 12, bottom: 4, left: 8 };

  const minY = points.length ? Math.min(...points.map((p) => p.close)) : 0;
  const maxY = points.length ? Math.max(...points.map((p) => p.close)) : 1;
  const rangeY = maxY - minY || 1;
  const paddedMin = minY - rangeY * 0.05;
  const paddedMax = maxY + rangeY * 0.05;

  const toX = (i: number) =>
    PAD.left + (i / Math.max(points.length - 1, 1)) * (W - PAD.left - PAD.right);
  const toY = (v: number) =>
    PAD.top + ((paddedMax - v) / (paddedMax - paddedMin)) * (H - PAD.top - PAD.bottom);

  const polylinePoints = points.map((p, i) => `${toX(i)},${toY(p.close)}`).join(" ");
  const areaPoints = points.length
    ? `${toX(0)},${H} ` + points.map((p, i) => `${toX(i)},${toY(p.close)}`).join(" ") + ` ${toX(points.length - 1)},${H}`
    : "";

  // Episode marker
  const episodeIdx = points.findIndex((p) => p.ts >= (data?.episodeTs ?? 0));
  const showEpisodeMarker = episodeIdx > 0;

  // Hover handling
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || points.length < 2) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const fraction = (mx - PAD.left) / (W - PAD.left - PAD.right);
      const idx = Math.round(Math.min(1, Math.max(0, fraction)) * (points.length - 1));
      setHover({ x: toX(idx), point: points[idx] });
    },
    [points, W, PAD.left, PAD.right]
  );

  const displayPoint = hover?.point ?? points[points.length - 1];
  const displayPrice = displayPoint?.close ?? null;
  const episodePrice = data?.episodePrice ?? null;
  const pctVsEpisode = displayPrice && episodePrice
    ? ((displayPrice - episodePrice) / episodePrice) * 100
    : null;
  const pctVsStart = displayPrice && points[0]
    ? ((displayPrice - points[0].close) / points[0].close) * 100
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl bg-[#1c1c1e] rounded-3xl overflow-hidden shadow-2xl border border-white/10">
        {/* Header */}
        <div className="px-6 pt-5 pb-2 flex items-start justify-between">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest mb-1">{ticker}</p>
            <h2 className="text-xl font-bold text-white">{data?.shortName ?? tickerLabel}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/20 transition-all text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Price hero */}
        <div className="px-6 pb-4">
          {loading ? (
            <div className="h-10 animate-pulse bg-white/5 rounded-lg w-32" />
          ) : displayPrice ? (
            <div className="flex items-end gap-3">
              <span className="text-4xl font-bold text-white tabular-nums">
                {fmt(displayPrice, data?.currency ?? "USD")}
              </span>
              {pctVsStart !== null && (
                <span
                  className="text-base font-semibold mb-1"
                  style={{ color: (pctVsStart ?? 0) >= 0 ? "#34d399" : "#f87171" }}
                >
                  {pctVsStart >= 0 ? "+" : ""}{pctVsStart.toFixed(2)}%
                </span>
              )}
            </div>
          ) : null}
          {displayPoint && (
            <p className="text-xs text-white/35 mt-1">{fmtDate(displayPoint.ts)}</p>
          )}
        </div>

        {/* Chart */}
        <div className="px-2 relative">
          {loading ? (
            <div className="h-52 flex items-center justify-center text-white/20 text-sm">
              Loading…
            </div>
          ) : points.length < 2 ? (
            <div className="h-52 flex items-center justify-center text-white/20 text-sm">
              No data available
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full cursor-crosshair"
              style={{ height: 208 }}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHover(null)}
            >
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accentColor} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Area fill */}
              <polygon points={areaPoints} fill="url(#chartGrad)" />

              {/* Episode marker line */}
              {showEpisodeMarker && (
                <>
                  <line
                    x1={toX(episodeIdx)} y1={PAD.top}
                    x2={toX(episodeIdx)} y2={H}
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={toX(episodeIdx) + 4}
                    y={PAD.top + 10}
                    fontSize="9"
                    fill="rgba(255,255,255,0.3)"
                  >
                    Prediction
                  </text>
                </>
              )}

              {/* Line */}
              <polyline
                points={polylinePoints}
                fill="none"
                stroke={accentColor}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Crosshair */}
              {hover && (
                <>
                  <line
                    x1={hover.x} y1={PAD.top}
                    x2={hover.x} y2={H}
                    stroke="rgba(255,255,255,0.25)"
                    strokeWidth="1"
                  />
                  <circle
                    cx={hover.x}
                    cy={toY(hover.point.close)}
                    r="4"
                    fill={accentColor}
                    stroke="#1c1c1e"
                    strokeWidth="2"
                  />
                </>
              )}
            </svg>
          )}
        </div>

        {/* Range tabs */}
        <div className="flex justify-center gap-1 px-6 py-3">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                range === r
                  ? "text-black"
                  : "text-white/40 hover:text-white/70"
              }`}
              style={range === r ? { background: accentColor } : {}}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Stats bar */}
        {!loading && episodePrice && data && (
          <div className="mx-5 mb-5 p-4 rounded-2xl bg-white/[0.05] grid grid-cols-3 gap-4">
            <Stat label="At episode" value={fmt(episodePrice, data.currency)} />
            <Stat label="Current" value={data.points.length ? fmt(data.points[data.points.length - 1].close, data.currency) : "—"} />
            <Stat
              label="Change since pred."
              value={pctVsEpisode !== null ? `${pctVsEpisode >= 0 ? "+" : ""}${pctVsEpisode.toFixed(1)}%` : "—"}
              valueColor={pctVsEpisode !== null ? (pctVsEpisode >= 0 ? "#34d399" : "#f87171") : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <p className="text-[10px] text-white/30 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm font-semibold tabular-nums" style={{ color: valueColor ?? "white" }}>{value}</p>
    </div>
  );
}
