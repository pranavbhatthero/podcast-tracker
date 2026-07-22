import { describe, it, expect } from "vitest";
import type { Prediction } from "../app/types";

function deduplicate(existing: Prediction[], incoming: Prediction[]): Prediction[] {
  const seen = new Set(existing.map((p) => `${p.episode_url}|${p.timestamp}`));
  const added = incoming.filter((p) => !seen.has(`${p.episode_url}|${p.timestamp}`));
  return [...existing, ...added];
}

const base: Prediction = {
  speaker: "Chamath",
  prediction: "NVDA will reach $200",
  asset_type: "stock",
  ticker_or_name: "NVDA",
  direction: "bullish",
  timeframe: "2026",
  confidence: "high",
  timestamp: "00:14:32",
  episode_title: "All-In E100",
  episode_date: "2026-01-01",
  episode_url: "https://youtube.com/watch?v=abc123",
  video_link: "https://youtu.be/abc123?t=872",
  price_ticker: "NVDA",
};

describe("deduplicate", () => {
  it("returns all predictions when no duplicates", () => {
    const p1 = { ...base, prediction: "Call 1", timestamp: "00:01:00" };
    const p2 = { ...base, prediction: "Call 2", timestamp: "00:02:00", episode_url: "https://youtube.com/watch?v=xyz" };
    expect(deduplicate([p1], [p2])).toHaveLength(2);
  });

  it("skips predictions matching episode_url + timestamp", () => {
    const p1 = { ...base };
    const duplicate = { ...base, prediction: "Same but different text" };
    expect(deduplicate([p1], [duplicate])).toHaveLength(1);
  });

  it("allows same timestamp from different episodes", () => {
    const p1 = { ...base, timestamp: "00:14:32" };
    const p2 = { ...base, timestamp: "00:14:32", episode_url: "https://youtube.com/watch?v=different" };
    expect(deduplicate([p1], [p2])).toHaveLength(2);
  });

  it("allows same episode with different timestamps", () => {
    const p1 = { ...base, timestamp: "00:14:32" };
    const p2 = { ...base, timestamp: "00:30:00" };
    expect(deduplicate([p1], [p2])).toHaveLength(2);
  });

  it("handles empty existing list", () => {
    expect(deduplicate([], [base])).toHaveLength(1);
  });

  it("handles empty incoming list", () => {
    expect(deduplicate([base], [])).toHaveLength(1);
  });
});
