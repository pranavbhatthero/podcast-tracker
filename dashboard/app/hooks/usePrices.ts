"use client";

import { useEffect, useState } from "react";
import type { PriceData } from "../api/prices/route";
import { priceKey } from "../api/prices/route";
import type { Prediction } from "../types";

export type PriceMap = Record<string, PriceData>;

export { priceKey };

export function usePrices(predictions: Prediction[]): PriceMap {
  const [prices, setPrices] = useState<PriceMap>({});

  useEffect(() => {
    // Dedupe by ticker|date pairs
    const pairs = Array.from(
      new Set(
        predictions
          .filter((p) => p.price_ticker && p.episode_date)
          .map((p) => `${p.price_ticker}|${p.episode_date}`)
      )
    );

    if (pairs.length === 0) return;

    // Batch in chunks of 50 to avoid URL length limits
    const CHUNK = 50;
    const fetches: Promise<PriceMap>[] = [];
    for (let i = 0; i < pairs.length; i += CHUNK) {
      const chunk = pairs.slice(i, i + CHUNK);
      fetches.push(
        fetch(`/api/prices?tickers=${chunk.join(",")}`)
          .then((r) => r.json())
          .catch(() => ({} as PriceMap))
      );
    }

    Promise.all(fetches).then((maps) => {
      const merged: PriceMap = {};
      for (const m of maps) Object.assign(merged, m);
      setPrices(merged);
    });
  }, [predictions]);

  return prices;
}
