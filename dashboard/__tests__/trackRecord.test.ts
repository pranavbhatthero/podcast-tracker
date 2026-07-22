import { describe, it, expect } from "vitest";
import { buildTrackRecord, signalScore } from "../app/lib/trackRecord";
import type { Prediction } from "../app/types";
import type { PriceMap } from "../app/hooks/usePrices";

function makePred(overrides: Partial<Prediction>): Prediction {
  return {
    speaker: "Chamath",
    prediction: "Test",
    asset_type: "stock",
    ticker_or_name: "NVDA",
    direction: "up",
    timeframe: "2026",
    confidence: "high",
    timestamp: "00:10:00",
    episode_title: "Test",
    episode_date: "2026-01-01",
    episode_url: "https://youtu.be/test",
    video_link: "https://youtu.be/test?t=600",
    price_ticker: "NVDA",
    ...overrides,
  };
}

function makePrices(overrides: Record<string, number>): PriceMap {
  const map: PriceMap = {};
  for (const [key, pctChange] of Object.entries(overrides)) {
    map[key] = {
      ticker: key.split("|")[0],
      episodeDate: key.split("|")[1],
      priceAtEpisode: 100,
      priceNow: 100 * (1 + pctChange / 100),
      pctChange,
      sparkline: [],
      currency: "USD",
    };
  }
  return map;
}

describe("buildTrackRecord", () => {
  it("computes overall hit rate correctly", () => {
    const preds = [
      makePred({ direction: "up",   price_ticker: "NVDA", episode_date: "2026-01-01" }),
      makePred({ direction: "up",   price_ticker: "NVDA", episode_date: "2026-02-01" }),
      makePred({ direction: "down", price_ticker: "NVDA", episode_date: "2026-03-01" }),
    ];
    const prices = makePrices({
      "NVDA|2026-01-01": 20,   // up + up → correct
      "NVDA|2026-02-01": 10,   // up → correct
      "NVDA|2026-03-01": -5,   // down → correct
    });
    const tr = buildTrackRecord("Chamath", preds, prices);
    expect(tr.overall.correct).toBe(3);
    expect(tr.overall.hitRate).toBe(1);
  });

  it("returns null hitRate when no scored predictions", () => {
    const preds = [makePred({ price_ticker: undefined })];
    const tr = buildTrackRecord("Chamath", preds, {});
    expect(tr.overall.hitRate).toBeNull();
  });

  it("splits by category correctly", () => {
    const preds = [
      makePred({ asset_type: "stock",  direction: "up", episode_date: "2026-01-01" }),
      makePred({ asset_type: "stock",  direction: "up", episode_date: "2026-02-01" }),
      makePred({ asset_type: "stock",  direction: "up", episode_date: "2026-03-01" }),
      makePred({ asset_type: "crypto", direction: "up", price_ticker: "BTC-USD", episode_date: "2026-01-01" }),
      makePred({ asset_type: "crypto", direction: "up", price_ticker: "BTC-USD", episode_date: "2026-02-01" }),
      makePred({ asset_type: "crypto", direction: "down", price_ticker: "BTC-USD", episode_date: "2026-03-01" }),
    ];
    const prices = makePrices({
      "NVDA|2026-01-01": 10, "NVDA|2026-02-01": 10, "NVDA|2026-03-01": 10,
      "BTC-USD|2026-01-01": 5, "BTC-USD|2026-02-01": -5, "BTC-USD|2026-03-01": 10,
    });
    const tr = buildTrackRecord("Chamath", preds, prices);
    const stockCat = tr.byCategory.find((c) => c.category === "stock");
    const cryptoCat = tr.byCategory.find((c) => c.category === "crypto");
    expect(stockCat?.hitRate).toBe(1);         // 3/3 correct
    expect(cryptoCat?.correct).toBe(1);        // only BTC-USD|2026-01-01 (up, +5%) correct
  });

  it("excludes categories with fewer than 3 predictions", () => {
    const preds = [
      makePred({ asset_type: "macro", direction: "up" }),
      makePred({ asset_type: "macro", direction: "up" }),
    ];
    const prices = makePrices({ "NVDA|2026-01-01": 10 });
    const tr = buildTrackRecord("Chamath", preds, prices);
    expect(tr.byCategory.find((c) => c.category === "macro")).toBeUndefined();
  });
});

describe("signalScore", () => {
  it("returns 0 when no track record", () => {
    expect(signalScore(makePred({}), undefined, 0)).toBe(0);
  });

  it("is higher for high confidence vs low", () => {
    const preds = Array.from({ length: 5 }, (_, i) =>
      makePred({ direction: "up", episode_date: `2026-0${i+1}-01` })
    );
    const prices = makePrices(Object.fromEntries(preds.map(p => [`NVDA|${p.episode_date}`, 10])));
    const tr = buildTrackRecord("Chamath", preds, prices);
    const high = signalScore(makePred({ confidence: "high" }), tr, 30);
    const low  = signalScore(makePred({ confidence: "low" }),  tr, 30);
    expect(high).toBeGreaterThan(low);
  });

  it("is higher for fresh predictions vs stale", () => {
    const preds = Array.from({ length: 5 }, (_, i) =>
      makePred({ direction: "up", episode_date: `2026-0${i+1}-01` })
    );
    const prices = makePrices(Object.fromEntries(preds.map(p => [`NVDA|${p.episode_date}`, 10])));
    const tr = buildTrackRecord("Chamath", preds, prices);
    const fresh = signalScore(makePred({}), tr, 0);
    const stale = signalScore(makePred({}), tr, 365);
    expect(fresh).toBeGreaterThan(stale);
  });
});
