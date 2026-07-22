import { describe, it, expect } from "vitest";
import { buildCanonicalMap, resolveCanonical } from "../app/lib/aliases";
import type { Expert } from "../app/types/expert";

const base = { own_channels: [], known_podcasts: [], search_terms: [], tags: [] };

const experts: Expert[] = [
  { ...base, id: "chamath", name: "Chamath", aliases: ["Chamath Palihapitiya", "Chamath Poly"], role: "Founder & CEO, Social Capital" },
  { ...base, id: "sacks", name: "Sacks", aliases: ["David Sacks", "Dave Sacks"], role: "AI & Crypto Czar" },
  { ...base, id: "brad_gerstner", name: "Brad Gerstner", aliases: ["Brad Gersonner"], role: "Founder & CEO, Altimeter Capital" },
];

describe("buildCanonicalMap", () => {
  it("creates entries for each expert", () => {
    const map = buildCanonicalMap(experts);
    expect(map.size).toBe(3);
    expect(map.has("Chamath")).toBe(true);
    expect(map.has("Sacks")).toBe(true);
    expect(map.has("Brad Gerstner")).toBe(true);
  });

  it("includes canonical name and all aliases (lowercased)", () => {
    const map = buildCanonicalMap(experts);
    expect(map.get("Chamath")).toContain("chamath");
    expect(map.get("Chamath")).toContain("chamath palihapitiya");
    expect(map.get("Sacks")).toContain("david sacks");
    expect(map.get("Brad Gerstner")).toContain("brad gersonner");
  });
});

describe("resolveCanonical", () => {
  const map = buildCanonicalMap(experts);

  it("resolves exact canonical name", () => {
    expect(resolveCanonical("Chamath", map)).toBe("Chamath");
    expect(resolveCanonical("Sacks", map)).toBe("Sacks");
  });

  it("resolves aliases to canonical name", () => {
    expect(resolveCanonical("Chamath Palihapitiya", map)).toBe("Chamath");
    expect(resolveCanonical("David Sacks", map)).toBe("Sacks");
    expect(resolveCanonical("Dave Sacks", map)).toBe("Sacks");
    expect(resolveCanonical("Brad Gersonner", map)).toBe("Brad Gerstner");
  });

  it("is case-insensitive", () => {
    expect(resolveCanonical("chamath palihapitiya", map)).toBe("Chamath");
    expect(resolveCanonical("DAVID SACKS", map)).toBe("Sacks");
  });

  it("returns original speaker for unknown names", () => {
    expect(resolveCanonical("Unknown Person", map)).toBe("Unknown Person");
  });
});
