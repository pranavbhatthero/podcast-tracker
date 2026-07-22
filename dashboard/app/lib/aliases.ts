import type { Expert } from "../types/expert";

export interface CanonicalMap {
  canonicalName: string;
  aliases: Set<string>;
}

export function buildCanonicalMap(experts: Expert[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const expert of experts) {
    const allNames = new Set([expert.name, ...expert.aliases].map((n) => n.toLowerCase()));
    map.set(expert.name, allNames);
  }
  return map;
}

export function resolveCanonical(speaker: string, canonicalMap: Map<string, Set<string>>): string {
  for (const [canonical, aliases] of canonicalMap) {
    if (aliases.has(speaker.toLowerCase())) return canonical;
  }
  return speaker;
}
