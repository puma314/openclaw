import { createSubsystemLogger } from "../../logging/subsystem.js";

type ShadowMetricKey = "chunk_markdown" | "rank_cosine";

type ShadowMetricState = {
  comparisons: number;
  matches: number;
  mismatches: number;
  tsDurationMsTotal: number;
  nativeDurationMsTotal: number;
  tsDurationMsMax: number;
  nativeDurationMsMax: number;
};

type ShadowMetricsMap = Record<ShadowMetricKey, ShadowMetricState>;

const log = createSubsystemLogger("memory.native");

const METRICS: ShadowMetricsMap = {
  chunk_markdown: {
    comparisons: 0,
    matches: 0,
    mismatches: 0,
    tsDurationMsTotal: 0,
    nativeDurationMsTotal: 0,
    tsDurationMsMax: 0,
    nativeDurationMsMax: 0,
  },
  rank_cosine: {
    comparisons: 0,
    matches: 0,
    mismatches: 0,
    tsDurationMsTotal: 0,
    nativeDurationMsTotal: 0,
    tsDurationMsMax: 0,
    nativeDurationMsMax: 0,
  },
};

export function recordShadowComparison(params: {
  key: ShadowMetricKey;
  matched: boolean;
  detail?: string;
  tsDurationMs?: number;
  nativeDurationMs?: number;
}) {
  const state = METRICS[params.key];
  state.comparisons += 1;
  if (typeof params.tsDurationMs === "number" && Number.isFinite(params.tsDurationMs)) {
    state.tsDurationMsTotal += params.tsDurationMs;
    state.tsDurationMsMax = Math.max(state.tsDurationMsMax, params.tsDurationMs);
  }
  if (typeof params.nativeDurationMs === "number" && Number.isFinite(params.nativeDurationMs)) {
    state.nativeDurationMsTotal += params.nativeDurationMs;
    state.nativeDurationMsMax = Math.max(state.nativeDurationMsMax, params.nativeDurationMs);
  }
  if (params.matched) {
    state.matches += 1;
    return;
  }
  state.mismatches += 1;
  if (state.mismatches <= 3 || state.mismatches % 50 === 0) {
    const detail = params.detail ? ` detail=${params.detail}` : "";
    log.warn(
      `shadow mismatch key=${params.key} mismatches=${state.mismatches} comparisons=${state.comparisons}${detail}`,
    );
  }
}

export function getShadowMetricsSnapshot() {
  const snapshotEntry = (state: ShadowMetricState) => ({
    comparisons: state.comparisons,
    matches: state.matches,
    mismatches: state.mismatches,
    tsDurationMsTotal: state.tsDurationMsTotal,
    nativeDurationMsTotal: state.nativeDurationMsTotal,
    tsDurationMsMax: state.tsDurationMsMax,
    nativeDurationMsMax: state.nativeDurationMsMax,
    tsDurationMsAvg: state.comparisons > 0 ? state.tsDurationMsTotal / state.comparisons : 0,
    nativeDurationMsAvg:
      state.comparisons > 0 ? state.nativeDurationMsTotal / state.comparisons : 0,
  });
  return {
    chunk_markdown: snapshotEntry(METRICS.chunk_markdown),
    rank_cosine: snapshotEntry(METRICS.rank_cosine),
  };
}

export function resetShadowMetricsForTest() {
  for (const state of Object.values(METRICS)) {
    state.comparisons = 0;
    state.matches = 0;
    state.mismatches = 0;
    state.tsDurationMsTotal = 0;
    state.nativeDurationMsTotal = 0;
    state.tsDurationMsMax = 0;
    state.nativeDurationMsMax = 0;
  }
}
