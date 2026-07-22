export const DIRECTIONAL = ["up", "bullish", "buy", "down", "bearish", "sell", "long", "short"] as const;
export type DirectionalDirection = (typeof DIRECTIONAL)[number];

export function isBullish(direction: string): boolean {
  return ["up", "bullish", "buy", "long"].includes(direction);
}

export function isBearish(direction: string): boolean {
  return ["down", "bearish", "sell", "short"].includes(direction);
}

export function isDirectional(direction: string): boolean {
  return (DIRECTIONAL as readonly string[]).includes(direction);
}

export function isCorrect(direction: string, pctChange: number): boolean {
  if (isBullish(direction)) return pctChange > 0;
  if (isBearish(direction)) return pctChange < 0;
  return false;
}

export function dirAdj(direction: string, pctChange: number): number {
  return isBullish(direction) ? pctChange : -pctChange;
}

export function avgReturn(returns: number[]): number | null {
  if (!returns.length) return null;
  return returns.reduce((a, b) => a + b, 0) / returns.length;
}

export function priceKey(ticker: string, episodeDate: string): string {
  return `${ticker}|${episodeDate}`;
}
