import { describe, expect, it } from "vitest";
import {
  getShadowMetricsSnapshot,
  recordShadowComparison,
  resetShadowMetricsForTest,
} from "./shadow-metrics.js";

describe("shadow metrics", () => {
  it("tracks comparisons, matches, and mismatches", () => {
    resetShadowMetricsForTest();
    recordShadowComparison({ key: "chunk_markdown", matched: true });
    recordShadowComparison({ key: "chunk_markdown", matched: false, detail: "test mismatch" });
    recordShadowComparison({ key: "rank_cosine", matched: true });
    const snapshot = getShadowMetricsSnapshot();
    expect(snapshot.chunk_markdown.comparisons).toBe(2);
    expect(snapshot.chunk_markdown.matches).toBe(1);
    expect(snapshot.chunk_markdown.mismatches).toBe(1);
    expect(snapshot.rank_cosine.comparisons).toBe(1);
    expect(snapshot.rank_cosine.matches).toBe(1);
    expect(snapshot.rank_cosine.mismatches).toBe(0);
  });
});
