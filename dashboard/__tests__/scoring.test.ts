import { describe, it, expect } from "vitest";
import { isCorrect, dirAdj, avgReturn, isBullish, isBearish, isDirectional, priceKey } from "../app/lib/scoring";

describe("isCorrect", () => {
  it("bullish directions are correct when pctChange > 0", () => {
    for (const d of ["up", "bullish", "buy", "long"]) {
      expect(isCorrect(d, 10)).toBe(true);
      expect(isCorrect(d, -5)).toBe(false);
    }
  });

  it("bearish directions are correct when pctChange < 0", () => {
    for (const d of ["down", "bearish", "sell", "short"]) {
      expect(isCorrect(d, -10)).toBe(true);
      expect(isCorrect(d, 5)).toBe(false);
    }
  });

  it("neutral direction is never correct", () => {
    expect(isCorrect("neutral", 100)).toBe(false);
    expect(isCorrect("neutral", -100)).toBe(false);
  });

  it("returns false when pctChange is exactly 0 (no move = not correct for any direction)", () => {
    expect(isCorrect("bullish", 0)).toBe(false);
    expect(isCorrect("bearish", 0)).toBe(false);
  });
});

describe("dirAdj", () => {
  it("returns positive pctChange for bullish directions", () => {
    expect(dirAdj("bullish", 20)).toBe(20);
    expect(dirAdj("up", 15)).toBe(15);
    expect(dirAdj("buy", 5)).toBe(5);
    expect(dirAdj("long", 8)).toBe(8);
  });

  it("inverts pctChange for bearish directions (gain when price falls)", () => {
    expect(dirAdj("bearish", -30)).toBe(30);
    expect(dirAdj("down", -10)).toBe(10);
    expect(dirAdj("sell", 5)).toBe(-5);
    expect(dirAdj("short", -20)).toBe(20);
  });
});

describe("avgReturn", () => {
  it("returns null for empty array", () => {
    expect(avgReturn([])).toBe(null);
  });

  it("returns the single value for one-element array", () => {
    expect(avgReturn([42])).toBe(42);
  });

  it("correctly averages multiple values", () => {
    expect(avgReturn([10, 20, 30])).toBe(20);
    expect(avgReturn([-10, 10])).toBe(0);
    expect(avgReturn([100, -40])).toBe(30);
  });
});

describe("isBullish / isBearish / isDirectional", () => {
  it("classifies directions correctly", () => {
    for (const d of ["up", "bullish", "buy", "long"]) {
      expect(isBullish(d)).toBe(true);
      expect(isBearish(d)).toBe(false);
      expect(isDirectional(d)).toBe(true);
    }
    for (const d of ["down", "bearish", "sell", "short"]) {
      expect(isBullish(d)).toBe(false);
      expect(isBearish(d)).toBe(true);
      expect(isDirectional(d)).toBe(true);
    }
    expect(isDirectional("neutral")).toBe(false);
    expect(isDirectional("other")).toBe(false);
  });
});

describe("priceKey", () => {
  it("produces TICKER|YYYY-MM-DD format", () => {
    expect(priceKey("NVDA", "2025-01-15")).toBe("NVDA|2025-01-15");
    expect(priceKey("BTC-USD", "2026-01-08")).toBe("BTC-USD|2026-01-08");
  });

  it("is case-sensitive for tickers", () => {
    expect(priceKey("nvda", "2025-01-15")).not.toBe(priceKey("NVDA", "2025-01-15"));
  });
});
