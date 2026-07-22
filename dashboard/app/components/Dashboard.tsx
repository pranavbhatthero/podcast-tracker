"use client";

import { useState, useMemo, useEffect } from "react";
import type { Prediction } from "../types";
import type { Expert } from "../types/expert";
import NewsCard from "./NewsCard";
import FeaturedCard from "./FeaturedCard";
import Scorecard from "./Scorecard";
import SpeakerPanel from "./SpeakerPanel";
import ConsensusView from "./ConsensusView";
import WatchlistPanel from "./WatchlistPanel";
import { usePrices, priceKey } from "../hooks/usePrices";
import { buildConsensusMap } from "../lib/consensus";

const TOPICS = ["For You", "Watchlist", "Consensus", "Bullish", "Bearish", "Stocks", "Commodities", "Macro", "Crypto", "Contrarian", "All-In", "BG2", "External"];

// Fixed colors for the 4 besties; all others get a stable color from this palette
const BESTIE_COLORS: Record<string, string> = {
  Chamath: "#a78bfa",
  Sacks: "#38bdf8",
  Friedberg: "#34d399",
  Jason: "#fb923c",
};
const PALETTE = [
  "#f472b6","#fb7185","#fbbf24","#34d399","#22d3ee",
  "#818cf8","#c084fc","#e879f9","#4ade80","#60a5fa",
  "#f97316","#a3e635","#2dd4bf","#e4d4f4","#94a3b8",
];
function expertColor(name: string, index: number): string {
  // Match on last name for the besties
  for (const [key, color] of Object.entries(BESTIE_COLORS)) {
    if (name === key || name.includes(key)) return color;
  }
  return PALETTE[index % PALETTE.length];
}

export default function Dashboard({ predictions, experts }: { predictions: Prediction[]; experts: Expert[] }) {
  const [activeTopic, setActiveTopic] = useState("For You");
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [panelSpeaker, setPanelSpeaker] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");

  // Available years derived from data (skip predictions with missing/empty dates)
  const availableYears = useMemo(() => {
    const years = Array.from(
      new Set(predictions.map(p => p.episode_date?.slice(0, 4)).filter((y): y is string => !!y && y.length === 4))
    ).sort().reverse();
    return years;
  }, [predictions]);
  const [lastUpdate, setLastUpdate] = useState<{ last_run: string; new_predictions: number } | null>(null);
  const [refreshState, setRefreshState] = useState<"idle" | "running" | "done" | "error">("idle");

  useEffect(() => {
    fetch("/last_update.json").then(r => r.json()).then(setLastUpdate).catch(() => {});
    // Check if already running
    fetch("/api/refresh").then(r => r.json()).then(d => {
      if (d.running) setRefreshState("running");
    }).catch(() => {});
  }, []);

  async function triggerRefresh() {
    if (refreshState === "running") return;
    setRefreshState("running");
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const data = await res.json();
      if (data.status === "already_running") {
        setRefreshState("running");
      } else {
        // Poll for completion by watching last_update.json
        const poll = setInterval(async () => {
          try {
            const lu = await fetch("/last_update.json?t=" + Date.now()).then(r => r.json());
            const running = await fetch("/api/refresh").then(r => r.json());
            if (!running.running) {
              setLastUpdate(lu);
              setRefreshState("done");
              clearInterval(poll);
              setTimeout(() => setRefreshState("idle"), 3000);
            }
          } catch {}
        }, 3000);
      }
    } catch {
      setRefreshState("error");
      setTimeout(() => setRefreshState("idle"), 3000);
    }
  }

  // Sync URL params on mount: ?speaker=Brad+Gerstner&search=micron&topic=Bullish&year=2026
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("speaker");
    const q = params.get("search");
    const t = params.get("topic");
    const y = params.get("year");
    if (s) setActiveSpeaker(s);
    if (q) setSearch(q);
    if (t && TOPICS.includes(t)) setActiveTopic(t);
    if (y) setYearFilter(y);
  }, []);

  const filtered = useMemo(() => {
    let list = predictions;

    if (activeTopic === "Bullish") list = list.filter((p) => ["up", "bullish", "buy"].includes(p.direction));
    else if (activeTopic === "Bearish") list = list.filter((p) => ["down", "bearish", "sell"].includes(p.direction));
    else if (activeTopic === "Stocks") list = list.filter((p) => p.asset_type === "stock");
    else if (activeTopic === "Commodities") list = list.filter((p) => p.asset_type === "commodity");
    else if (activeTopic === "Macro") list = list.filter((p) => p.asset_type === "macro");
    else if (activeTopic === "Crypto") list = list.filter((p) => p.asset_type === "crypto");
    else if (activeTopic === "Contrarian") list = list.filter((p) => p.prediction.startsWith("[CONTRARIAN]"));
    else if (activeTopic === "External") list = list.filter((p) => p.source === "external");
    else if (activeTopic === "All-In") list = list.filter((p) => p.source === "allin");
    else if (activeTopic === "BG2") list = list.filter((p) => p.source === "bg2");

    if (yearFilter !== "all") {
      list = list.filter((p) => p.episode_date.startsWith(yearFilter));
    }

    if (activeSpeaker) {
      const expert = experts.find((e) => e.name === activeSpeaker);
      const names = expert ? [expert.name, ...expert.aliases].map((a) => a.toLowerCase()) : [activeSpeaker.toLowerCase()];
      list = list.filter((p) => names.includes(p.speaker.toLowerCase()));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.prediction.toLowerCase().includes(q) ||
          p.ticker_or_name.toLowerCase().includes(q) ||
          p.speaker.toLowerCase().includes(q)
      );
    }

    return list;
  }, [predictions, activeTopic, activeSpeaker, search, yearFilter]);

  // speakers with predictions (for sidebar cards)
  const speakersWithData = Array.from(new Set(predictions.map((p) => p.speaker)));
  const prices = usePrices(predictions);

  // Recent episodes: all distinct episode dates within the last 14 days, sorted newest first
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const recentDates = Array.from(
    new Set(filtered.filter((p) => p.episode_date && p.episode_date >= cutoffStr).map((p) => p.episode_date))
  ).sort((a, b) => b.localeCompare(a));
  // Map each recent date to its predictions + episode title
  const recentEpisodes = recentDates.map((date) => {
    const eps = filtered.filter((p) => p.episode_date === date);
    return { date, title: eps[0]?.episode_title ?? date, predictions: eps };
  });
  const recentPredSet = new Set(recentEpisodes.flatMap((e) => e.predictions));

  // Feature the prediction with the biggest absolute price move from non-recent predictions
  const nonRecent = filtered.filter((p) => !recentPredSet.has(p));
  const featured = nonRecent.length
    ? [...nonRecent].sort((a, b) => {
        const pa = a.price_ticker ? prices[priceKey(a.price_ticker, a.episode_date)] : null;
        const pb = b.price_ticker ? prices[priceKey(b.price_ticker, b.episode_date)] : null;
        const ma = pa?.pctChange != null ? Math.abs(pa.pctChange) : 0;
        const mb = pb?.pctChange != null ? Math.abs(pb.pctChange) : 0;
        return mb - ma;
      })[0]
    : null;

  // Time-decay sort: recency boost — newer predictions surface higher
  const now = Date.now();
  const rest = nonRecent
    .filter((p) => p !== featured)
    .sort((a, b) => {
      const daysA = a.episode_date ? Math.floor((now - new Date(a.episode_date).getTime()) / 86400000) : 9999;
      const daysB = b.episode_date ? Math.floor((now - new Date(b.episode_date).getTime()) / 86400000) : 9999;
      // Recency score: 1.0 for today, decays over 180 days
      const recencyA = Math.max(0, 1 - daysA / 180);
      const recencyB = Math.max(0, 1 - daysB / 180);
      const priceA = a.price_ticker ? Math.abs(prices[priceKey(a.price_ticker, a.episode_date)]?.pctChange ?? 0) : 0;
      const priceB = b.price_ticker ? Math.abs(prices[priceKey(b.price_ticker, b.episode_date)]?.pctChange ?? 0) : 0;
      // Score = price signal + recency bonus
      return (priceB + recencyB * 10) - (priceA + recencyA * 10);
    });

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white font-sans">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-[#0d0d0d]/90 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <span className="text-sm font-semibold text-white/70 tracking-tight flex-shrink-0">All‑In</span>

          {/* Search */}
          <div className="relative w-48">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-sm bg-white/[0.07] rounded-full border border-white/10 placeholder-white/25 text-white focus:outline-none focus:border-white/25 focus:bg-white/10 transition-all"
            />
          </div>

          {/* Year filter */}
          <div className="flex items-center gap-1 ml-2">
            {["all", ...availableYears].map((y) => (
              <button
                key={y}
                onClick={() => setYearFilter(y)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                  yearFilter === y
                    ? "bg-white/15 border-white/30 text-white"
                    : "bg-transparent border-white/10 text-white/35 hover:text-white/60"
                }`}
              >
                {y === "all" ? "All" : y}
              </button>
            ))}
          </div>

          {/* Last updated + refresh button */}
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            {lastUpdate && (
              <span className="text-[10px] text-white/20">
                Updated {fmtRelative(lastUpdate.last_run)}
              </span>
            )}
            <button
              onClick={triggerRefresh}
              disabled={refreshState === "running"}
              title={refreshState === "running" ? "Checking for new episodes…" : "Check for new episodes"}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all border ${
                refreshState === "done"
                  ? "border-emerald-400/40 text-emerald-400 bg-emerald-400/10"
                  : refreshState === "error"
                  ? "border-red-400/40 text-red-400 bg-red-400/10"
                  : refreshState === "running"
                  ? "border-white/10 text-white/30 cursor-not-allowed"
                  : "border-white/10 text-white/30 hover:border-white/25 hover:text-white/60 bg-transparent"
              }`}
            >
              {refreshState === "done" ? (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg
                  className={`w-3.5 h-3.5 ${refreshState === "running" ? "animate-spin" : ""}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>

          {/* Clear filter badge */}
          {activeSpeaker && (
            <button
              onClick={() => setActiveSpeaker(null)}
              className="ml-auto flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-white/50 bg-white/[0.07] hover:bg-white/[0.12] border border-white/10 transition-all"
            >
              <span>Showing: <span className="text-white font-medium">{activeSpeaker.split(" ").pop()}</span></span>
              <span className="ml-1 text-white/40">×</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5">
        {/* Expert filter pills */}
        <div className="flex flex-wrap gap-2 mb-5">
          {experts.map((expert, i) => {
            const color = expertColor(expert.name, i);
            const active = activeSpeaker === expert.name;
            const shortName = expert.name.includes(" ")
              ? expert.name.split(" ").slice(-1)[0]
              : expert.name;
            return (
              <button
                key={expert.id}
                onClick={() => setActiveSpeaker(active ? null : expert.name)}
                title={expert.name}
                className="px-4 py-1.5 rounded-full text-sm font-medium transition-all border"
                style={active
                  ? { background: color, borderColor: color, color: "#000" }
                  : { background: "transparent", borderColor: `${color}40`, color }
                }
              >
                {shortName}
              </button>
            );
          })}
        </div>

        {/* Topic tabs */}
        <div className="flex gap-0 overflow-x-auto hide-scrollbar mb-6 border-b border-white/[0.06]">
          {TOPICS.map((t) => (
            <button
              key={t}
              onClick={() => { setActiveTopic(t); setActiveSpeaker(null); }}
              className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                activeTopic === t
                  ? "border-white text-white font-medium"
                  : "border-transparent text-white/40 hover:text-white/70"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {activeTopic === "Watchlist" ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <WatchlistPanel predictions={predictions} prices={prices} />
            </div>
            <div className="space-y-4">
              <Scorecard
                predictions={predictions}
                experts={experts}
                prices={prices}
                onSpeakerClick={(s) => setPanelSpeaker(panelSpeaker === s ? null : s)}
                activeSpeaker={activeSpeaker}
                panelSpeaker={panelSpeaker}
              />
            </div>
          </div>
        ) : activeTopic === "Consensus" ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ConsensusView
                predictions={filtered}
                prices={prices}
                onSpeakerClick={(s) => setPanelSpeaker(panelSpeaker === s ? null : s)}
              />
            </div>
            <div className="space-y-4">
              <Scorecard
                predictions={predictions}
                experts={experts}
                prices={prices}
                onSpeakerClick={(s) => setPanelSpeaker(panelSpeaker === s ? null : s)}
                activeSpeaker={activeSpeaker}
                panelSpeaker={panelSpeaker}
              />
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-white/25 text-sm">No predictions match.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main feed */}
            <div className="lg:col-span-2 space-y-5">
              {recentEpisodes.map(({ date, title, predictions: eps }) => (
                <section key={date}>
                  <SectionLabel>
                    {recentLabel(date)}
                    <span className="ml-2 text-[10px] font-medium text-white/25 normal-case tracking-normal truncate">
                      {title}
                    </span>
                  </SectionLabel>
                  <div className="bg-[#161616] rounded-2xl border border-white/[0.07] divide-y divide-white/[0.05] overflow-hidden">
                    {eps.map((p, i) => (
                      <NewsCard key={i} prediction={p} priceData={p.price_ticker ? prices[priceKey(p.price_ticker, p.episode_date)] : undefined} />
                    ))}
                  </div>
                </section>
              ))}

              {featured && (
                <section>
                  <SectionLabel>Top Story</SectionLabel>
                  <FeaturedCard prediction={featured} priceData={featured.price_ticker ? prices[priceKey(featured.price_ticker, featured.episode_date)] : undefined} />
                </section>
              )}

              {rest.length > 0 && (
                <section>
                  <SectionLabel>All Predictions</SectionLabel>
                  <div className="bg-[#161616] rounded-2xl border border-white/[0.07] divide-y divide-white/[0.05] overflow-hidden">
                    {rest.map((p, i) => (
                      <NewsCard key={i} prediction={p} priceData={p.price_ticker ? prices[priceKey(p.price_ticker, p.episode_date)] : undefined} />
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <Scorecard
                predictions={predictions}
                experts={experts}
                prices={prices}
                onSpeakerClick={(s) => setPanelSpeaker(panelSpeaker === s ? null : s)}
                activeSpeaker={activeSpeaker}
                panelSpeaker={panelSpeaker}
              />

              {/* Sidebar: only show experts who have predictions */}
              {experts
                .filter((expert) => {
                  const names = [expert.name, ...expert.aliases].map((a) => a.toLowerCase());
                  return speakersWithData.some((s) => names.includes(s.toLowerCase()));
                })
                .map((expert, i) => {
                  const color = expertColor(expert.name, i);
                  const names = [expert.name, ...expert.aliases].map((a) => a.toLowerCase());
                  const picks = predictions.filter((p) => names.includes(p.speaker.toLowerCase())).slice(0, 4);
                  const count = predictions.filter((p) => names.includes(p.speaker.toLowerCase())).length;
                  const active = activeSpeaker === expert.name;
                  return (
                    <section key={expert.id} className="bg-[#161616] rounded-2xl border border-white/[0.07] overflow-hidden">
                      <button
                        onClick={() => setActiveSpeaker(active ? null : expert.name)}
                        className="w-full px-4 py-3 flex items-center gap-2 border-l-2 hover:bg-white/[0.03] transition-colors text-left"
                        style={{ borderLeftColor: color }}
                      >
                        <span
                          className="text-sm font-semibold transition-colors"
                          style={{ color: active ? color : "rgba(255,255,255,0.9)" }}
                        >
                          {expert.name}
                        </span>
                        {active && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: `${color}20`, color }}>
                            filtered
                          </span>
                        )}
                        <span className="ml-auto text-xs text-white/30">{count} calls</span>
                      </button>
                      <div className="divide-y divide-white/[0.05]">
                        {picks.map((p, j) => (
                          <SidebarItem key={j} prediction={p} color={color} />
                        ))}
                      </div>
                    </section>
                  );
                })}
            </div>
          </div>
        )}
      </main>

      {/* Speaker detail panel */}
      {panelSpeaker && (() => {
        const expert = experts.find((e) => {
          const names = [e.name, ...e.aliases].map((a) => a.toLowerCase());
          return names.includes(panelSpeaker.toLowerCase());
        }) ?? null;
        const aliasSet = expert
          ? new Set([expert.name, ...expert.aliases].map((a) => a.toLowerCase()))
          : new Set([panelSpeaker.toLowerCase()]);
        const speakerPreds = predictions.filter((p) => aliasSet.has(p.speaker.toLowerCase()));
        const color = expertColor(panelSpeaker, experts.findIndex((e) => e.name === panelSpeaker));
        return (
          <SpeakerPanel
            speaker={expert?.name ?? panelSpeaker}
            expert={expert}
            predictions={speakerPreds}
            prices={prices}
            color={color}
            onClose={() => setPanelSpeaker(null)}
          />
        );
      })()}
    </div>
  );
}

function fmtRelative(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function recentLabel(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "This Week";
  if (diffDays <= 14) return "Last Week";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">{children}</span>
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  );
}

function SidebarItem({ prediction: p, color }: { prediction: Prediction; color: string }) {
  const isBullish = ["up", "bullish", "buy"].includes(p.direction);
  const isBearish = ["down", "bearish", "sell"].includes(p.direction);
  const clean = p.prediction.replace("[CONTRARIAN] ", "");

  return (
    <a
      href={p.video_link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white/80 leading-snug line-clamp-1 group-hover:text-white transition-colors">
          {p.ticker_or_name}
        </p>
        <p className="text-xs text-white/30 mt-0.5 line-clamp-1">{clean.slice(0, 55)}…</p>
      </div>
      <span className={`text-base flex-shrink-0 mt-0.5 ${isBullish ? "text-emerald-400" : isBearish ? "text-red-400" : "text-white/30"}`}>
        {isBullish ? "↑" : isBearish ? "↓" : "→"}
      </span>
    </a>
  );
}
