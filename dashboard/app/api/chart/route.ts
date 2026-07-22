import { NextRequest, NextResponse } from "next/server";

export interface ChartPoint {
  ts: number;   // unix seconds
  close: number;
}

export interface ChartResponse {
  ticker: string;
  shortName: string;
  currency: string;
  points: ChartPoint[];
  episodePrice: number | null;
  episodeTs: number;
}

async function fetchRange(ticker: string, interval: string, period1: number): Promise<ChartPoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&period1=${period1}&period2=9999999999`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 900 },
  });
  if (!res.ok) return [];
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

  const points: ChartPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (typeof c === "number" && !isNaN(c)) {
      points.push({ ts: timestamps[i], close: c });
    }
  }
  return points;
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker") ?? "";
  const range = req.nextUrl.searchParams.get("range") ?? "6M";
  // episodeDate is passed from ChartModal so "All" shows from the prediction date
  const episodeDateParam = req.nextUrl.searchParams.get("episodeDate");

  if (!ticker) return NextResponse.json({ error: "No ticker" }, { status: 400 });

  // Derive episodeTs from the passed date, or fall back to now - 1y
  const episodeTs = episodeDateParam
    ? Math.floor(new Date(episodeDateParam).getTime() / 1000)
    : Math.floor(Date.now() / 1000) - 365 * 86400;

  const now = Math.floor(Date.now() / 1000);
  let period1: number;
  let interval: string;

  switch (range) {
    case "1W": period1 = now - 7 * 86400;   interval = "1h";  break;
    case "1M": period1 = now - 30 * 86400;  interval = "1d";  break;
    case "3M": period1 = now - 90 * 86400;  interval = "1d";  break;
    case "6M": period1 = now - 180 * 86400; interval = "1d";  break;
    case "1Y": period1 = now - 365 * 86400; interval = "1wk"; break;
    case "All": default:
      period1 = episodeTs; interval = "1wk"; break;
  }

  // For non-"All" ranges, don't go before the episode date
  const effectivePeriod1 = range === "All" ? episodeTs : Math.max(period1, episodeTs);

  const [points, metaRes] = await Promise.all([
    fetchRange(ticker, interval, effectivePeriod1),
    fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 900 },
    }),
  ]);

  let shortName = ticker;
  let currency = "USD";
  let episodePrice: number | null = null;

  try {
    const metaJson = await metaRes.json();
    const meta = metaJson?.chart?.result?.[0]?.meta;
    shortName = meta?.shortName ?? meta?.symbol ?? ticker;
    currency = meta?.currency ?? "USD";
  } catch {}

  // Find closest price to episode date from weekly data
  const allPoints = await fetchRange(ticker, "1wk", episodeTs);
  if (allPoints.length > 0) episodePrice = allPoints[0].close;

  return NextResponse.json({ ticker, shortName, currency, points, episodePrice, episodeTs } satisfies ChartResponse);
}
