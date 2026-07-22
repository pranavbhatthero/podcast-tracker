import { NextRequest, NextResponse } from "next/server";

export interface PriceData {
  ticker: string;
  episodeDate: string;
  priceAtEpisode: number | null;
  priceNow: number | null;
  pctChange: number | null;
  sparkline: number[]; // weekly closes from episode date to now
  currency: string;
}

// key format used in PriceMap: "TICKER|YYYY-MM-DD"
export function priceKey(ticker: string, episodeDate: string): string {
  return `${ticker}|${episodeDate}`;
}

async function fetchPriceData(ticker: string, episodeDate: string): Promise<PriceData> {
  const blank: PriceData = { ticker, episodeDate, priceAtEpisode: null, priceNow: null, pctChange: null, sparkline: [], currency: "USD" };

  const period1 = Math.floor(new Date(episodeDate).getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1wk&period1=${period1}&period2=9999999999`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });
  } catch {
    return blank;
  }

  if (!res.ok) return blank;

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return blank;

  const closes: number[] = (result.indicators?.quote?.[0]?.close ?? []).filter(
    (c: unknown): c is number => typeof c === "number" && !isNaN(c)
  );

  const currency: string = result.meta?.currency ?? "USD";
  const priceNow: number | null = result.meta?.regularMarketPrice ?? null;
  const priceAtEpisode: number | null = closes[0] ?? null;
  const sparkline = closes.slice(0, 52); // up to ~1 year of weekly data

  const pctChange =
    priceAtEpisode && priceNow
      ? parseFloat((((priceNow - priceAtEpisode) / priceAtEpisode) * 100).toFixed(1))
      : null;

  return { ticker, episodeDate, priceAtEpisode, priceNow, pctChange, sparkline, currency };
}

export async function GET(req: NextRequest) {
  // Accepts ?tickers=MU|2025-01-11,NVDA|2026-01-08,...
  const raw = req.nextUrl.searchParams.get("tickers")?.split(",").filter(Boolean) ?? [];

  if (raw.length === 0) {
    return NextResponse.json({ error: "No tickers" }, { status: 400 });
  }

  const pairs = raw.map((s) => {
    const [ticker, date] = s.split("|");
    return { ticker: ticker.trim(), date: date?.trim() ?? "" };
  }).filter((p) => p.ticker && p.date);

  const results = await Promise.all(pairs.map((p) => fetchPriceData(p.ticker, p.date)));
  const map: Record<string, PriceData> = {};
  for (const r of results) map[priceKey(r.ticker, r.episodeDate)] = r;

  return NextResponse.json(map);
}
