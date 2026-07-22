import { describe, it, expect } from "vitest";
import { buildConsensusMap, consensusStrength, daysSinceDate } from "../app/lib/consensus";
import type { Prediction } from "../app/types";

function makePred(overrides: Partial<Prediction>): Prediction {
  return {
    speaker: "Chamath",
    prediction: "Test prediction",
    asset_type: "stock",
    ticker_or_name: "NVDA",
    direction: "up",
    timeframe: "2026",
    confidence: "high",
    timestamp: "00:10:00",
    episode_title: "Test Episode",
    episode_date: "2026-01-01",
    episode_url: "https://youtu.be/test",
    video_link: "https://youtu.be/test?t=600",
    price_ticker: "NVDA",
    ...overrides,
  };
}

describe("daysSinceDate", () => {
  const NOW = new Date("2026-06-30T12:00:00Z").getTime();

  it("returns 0 for today", () => {
    expect(daysSinceDate("2026-06-30", NOW)).toBe(0);
  });

  it("returns 1 for yesterday", () => {
    expect(daysSinceDate("2026-06-29", NOW)).toBe(1);
  });

  it("returns 30 for 30 days ago", () => {
    expect(daysSinceDate("2026-05-31", NOW)).toBe(30);
  });
});

describe("buildConsensusMap", () => {
  it("returns empty for predictions with only one expert", () => {
    const preds = [
      makePred({ speaker: "Chamath", direction: "up" }),
      makePred({ speaker: "Chamath", direction: "up" }),
    ];
    expect(buildConsensusMap(preds)).toHaveLength(0);
  });

  it("returns entry when 2+ experts call same ticker", () => {
    const preds = [
      makePred({ speaker: "Chamath", direction: "up" }),
      makePred({ speaker: "Sacks", direction: "up" }),
    ];
    const result = buildConsensusMap(preds);
    expect(result).toHaveLength(1);
    expect(result[0].experts).toHaveLength(2);
    expect(result[0].bullish).toHaveLength(2);
    expect(result[0].bearish).toHaveLength(0);
  });

  it("handles split bullish/bearish correctly", () => {
    const preds = [
      makePred({ speaker: "Chamath", direction: "up" }),
      makePred({ speaker: "Sacks", direction: "down" }),
      makePred({ speaker: "Friedberg", direction: "bullish" }),
    ];
    const result = buildConsensusMap(preds);
    expect(result[0].bullish).toHaveLength(2);
    expect(result[0].bearish).toHaveLength(1);
    expect(result[0].experts).toHaveLength(3);
  });

  it("groups by price_ticker when available", () => {
    const preds = [
      makePred({ speaker: "Chamath", ticker_or_name: "Nvidia", price_ticker: "NVDA" }),
      makePred({ speaker: "Sacks", ticker_or_name: "NVDA Corp", price_ticker: "NVDA" }),
    ];
    const result = buildConsensusMap(preds);
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe("NVDA");
  });

  it("uses latestDate from most recent prediction", () => {
    const preds = [
      makePred({ speaker: "Chamath", episode_date: "2026-01-01" }),
      makePred({ speaker: "Sacks", episode_date: "2026-06-01" }),
    ];
    const result = buildConsensusMap(preds);
    expect(result[0].latestDate).toBe("2026-06-01");
  });

  it("skips non-directional predictions", () => {
    const preds = [
      makePred({ speaker: "Chamath", direction: "neutral" }),
      makePred({ speaker: "Sacks", direction: "neutral" }),
    ];
    expect(buildConsensusMap(preds)).toHaveLength(0);
  });
});

describe("consensusStrength", () => {
  it("is higher for more experts", () => {
    const now = new Date("2026-01-10").getTime();
    const base = {
      ticker: "NVDA", label: "Nvidia", bullish: [makePred({})], bearish: [],
      latestDate: "2026-01-01", priceTicker: "NVDA", daysSince: 9,
    };
    const few  = { ...base, experts: ["Chamath", "Sacks"] };
    const many = { ...base, experts: ["Chamath", "Sacks", "Friedberg", "Jason"] };
    expect(consensusStrength(many)).toBeGreaterThan(consensusStrength(few));
  });

  it("is higher for unanimous vs split", () => {
    const base = {
      ticker: "NVDA", label: "Nvidia",
      experts: ["Chamath", "Sacks", "Friedberg"],
      latestDate: "2026-01-01", priceTicker: "NVDA", daysSince: 9,
    };
    const pred = makePred({});
    const unanimous = { ...base, bullish: [pred, pred, pred], bearish: [] };
    const split     = { ...base, bullish: [pred, pred], bearish: [pred] };
    expect(consensusStrength(unanimous)).toBeGreaterThan(consensusStrength(split));
  });

  it("is higher for more recent predictions", () => {
    const base = {
      ticker: "NVDA", label: "Nvidia",
      experts: ["Chamath", "Sacks"],
      bullish: [makePred({})], bearish: [],
      priceTicker: "NVDA",
    };
    const fresh = { ...base, latestDate: new Date().toISOString().slice(0, 10), daysSince: 0 };
    const stale = { ...base, latestDate: "2024-01-01", daysSince: 730 };
    expect(consensusStrength(fresh)).toBeGreaterThan(consensusStrength(stale));
  });
});
