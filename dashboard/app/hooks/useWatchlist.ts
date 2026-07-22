"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "allin_watchlist";

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setWatchlist(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  const save = useCallback((next: Set<string>) => {
    setWatchlist(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch {}
  }, []);

  const toggle = useCallback((ticker: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      save(next);
      return next;
    });
  }, [save]);

  const isWatched = useCallback((ticker: string) => watchlist.has(ticker), [watchlist]);

  return { watchlist, toggle, isWatched };
}
