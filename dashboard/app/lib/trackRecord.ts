import type { Prediction } from "../types";
import type { PriceMap } from "../hooks/usePrices";
import { priceKey, DIRECTIONAL, isCorrect, dirAdj } from "./scoring";

export interface CategoryStats {
  category: string;
  total: number;
  scored: number;
  correct: number;
  hitRate: number | null;   // 0–1
  avgReturn: number | null;
}

export interface SpeakerTrackRecord {
  speaker: string;
  overall: CategoryStats;
  byCategory: CategoryStats[];
}

export function buildTrackRecord(
  speaker: string,
  predictions: Prediction[],
  prices: PriceMap
): SpeakerTrackRecord {
  const categories = Array.from(new Set(predictions.map((p) => p.asset_type))).filter(Boolean);
  const all = ["overall", ...categories];

  function statsFor(preds: Prediction[]): CategoryStats {
    const scored = preds.filter((p) => {
      if (!p.price_ticker || !DIRECTIONAL.includes(p.direction as typeof DIRECTIONAL[number])) return false;
      const d = prices[priceKey(p.price_ticker, p.episode_date)];
      return d?.pctChange != null;
    });

    const correct = scored.filter((p) => {
      const d = prices[priceKey(p.price_ticker!, p.episode_date)]!;
      return isCorrect(p.direction, d.pctChange!);
    }).length;

    const returns = scored.map((p) => {
      const d = prices[priceKey(p.price_ticker!, p.episode_date)]!;
      return dirAdj(p.direction, d.pctChange!);
    });

    return {
      category: "",
      total: preds.length,
      scored: scored.length,
      correct,
      hitRate: scored.length > 0 ? correct / scored.length : null,
      avgReturn: returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : null,
    };
  }

  const overall = { ...statsFor(predictions), category: "overall" };

  const byCategory = categories.map((cat) => ({
    ...statsFor(predictions.filter((p) => p.asset_type === cat)),
    category: cat,
  })).filter((s) => s.total >= 3); // only show categories with enough data

  return { speaker, overall, byCategory };
}

// Weighted signal score for a single prediction
// Higher = more confident this prediction is worth acting on
export function signalScore(
  prediction: Prediction,
  trackRecord: SpeakerTrackRecord | undefined,
  daysSince: number
): number {
  if (!trackRecord) return 0;

  // Category-specific hit rate, fall back to overall
  const catStats = trackRecord.byCategory.find(
    (c) => c.category === prediction.asset_type
  ) ?? trackRecord.overall;

  const hitRate = catStats.hitRate ?? 0.5;
  const confidenceBonus = prediction.confidence === "high" ? 0.2 : prediction.confidence === "medium" ? 0.1 : 0;
  const recency = Math.max(0, 1 - daysSince / 365);

  return hitRate + confidenceBonus + recency * 0.3;
}
