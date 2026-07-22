import { describe, it, expect } from "vitest";
import { tsToSecs, secsToTs } from "../app/lib/timestamps";

describe("tsToSecs", () => {
  it("parses standard HH:MM:SS", () => {
    expect(tsToSecs("00:00:00")).toBe(0);
    expect(tsToSecs("00:01:30")).toBe(90);
    expect(tsToSecs("01:00:00")).toBe(3600);
    expect(tsToSecs("01:23:45")).toBe(5025);
    expect(tsToSecs("08:59:30")).toBe(32370);
  });

  it("strips brackets from [HH:MM:SS]", () => {
    expect(tsToSecs("[00:27:30]")).toBe(1650);
    expect(tsToSecs("[01:00:00]")).toBe(3600);
  });

  it("handles malformed 3-digit seconds by clamping to 0", () => {
    // These come from yt-dlp bugs: "00:27:279" — 279 > 59, clamp to 0
    expect(tsToSecs("00:27:279")).toBe(27 * 60); // 1620
    expect(tsToSecs("00:51:120")).toBe(51 * 60); // 3060
    expect(tsToSecs("08:59:440")).toBe(8 * 3600 + 59 * 60); // 32340
    expect(tsToSecs("05:54:800")).toBe(5 * 3600 + 54 * 60); // 21240
  });

  it("parses MM:SS format", () => {
    expect(tsToSecs("27:30")).toBe(1650);
    expect(tsToSecs("05:00")).toBe(300);
  });

  it("returns 0 for empty or invalid input", () => {
    expect(tsToSecs("")).toBe(0);
    expect(tsToSecs("00:00")).toBe(0);
  });
});

describe("secsToTs", () => {
  it("formats seconds back to HH:MM:SS", () => {
    expect(secsToTs(0)).toBe("00:00:00");
    expect(secsToTs(90)).toBe("00:01:30");
    expect(secsToTs(3600)).toBe("01:00:00");
    expect(secsToTs(5025)).toBe("01:23:45");
  });

  it("is the inverse of tsToSecs for valid inputs", () => {
    const secs = 7654;
    expect(tsToSecs(secsToTs(secs))).toBe(secs);
  });
});
