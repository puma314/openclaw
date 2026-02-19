import { describe, expect, it } from "vitest";
import {
  getShadowMetricsSnapshot,
  recordShadowComparison,
  resetShadowMetricsForTest,
} from "./shadow-metrics.js";

describe("shadow metrics", () => {
  it("tracks comparisons, matches, and mismatches", () => {
    resetShadowMetricsForTest();
    recordShadowComparison({
      key: "chunk_markdown",
      matched: true,
      tsDurationMs: 4,
      nativeDurationMs: 2,
    });
    recordShadowComparison({
      key: "chunk_markdown",
      matched: false,
      detail: "test mismatch",
      tsDurationMs: 6,
      nativeDurationMs: 5,
    });
    recordShadowComparison({
      key: "rank_cosine",
      matched: true,
      tsDurationMs: 3,
      nativeDurationMs: 1,
    });
    const snapshot = getShadowMetricsSnapshot();
    expect(snapshot.chunk_markdown.comparisons).toBe(2);
    expect(snapshot.chunk_markdown.matches).toBe(1);
    expect(snapshot.chunk_markdown.mismatches).toBe(1);
    expect(snapshot.chunk_markdown.tsDurationMsTotal).toBe(10);
    expect(snapshot.chunk_markdown.nativeDurationMsTotal).toBe(7);
    expect(snapshot.chunk_markdown.tsDurationMsMax).toBe(6);
    expect(snapshot.chunk_markdown.nativeDurationMsMax).toBe(5);
    expect(snapshot.chunk_markdown.tsDurationMsAvg).toBe(5);
    expect(snapshot.chunk_markdown.nativeDurationMsAvg).toBe(3.5);
    expect(snapshot.rank_cosine.comparisons).toBe(1);
    expect(snapshot.rank_cosine.matches).toBe(1);
    expect(snapshot.rank_cosine.mismatches).toBe(0);
    expect(snapshot.rank_cosine.tsDurationMsAvg).toBe(3);
    expect(snapshot.rank_cosine.nativeDurationMsAvg).toBe(1);
  });
});
