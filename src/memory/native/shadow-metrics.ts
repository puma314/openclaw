import { createSubsystemLogger } from "../../logging/subsystem.js";

type ShadowMetricKey = "chunk_markdown" | "rank_cosine";

type ShadowMetricState = {
  comparisons: number;
  matches: number;
  mismatches: number;
};

type ShadowMetricsMap = Record<ShadowMetricKey, ShadowMetricState>;

const log = createSubsystemLogger("memory.native");

const METRICS: ShadowMetricsMap = {
  chunk_markdown: { comparisons: 0, matches: 0, mismatches: 0 },
  rank_cosine: { comparisons: 0, matches: 0, mismatches: 0 },
};

export function recordShadowComparison(params: {
  key: ShadowMetricKey;
  matched: boolean;
  detail?: string;
}) {
  const state = METRICS[params.key];
  state.comparisons += 1;
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
  return {
    chunk_markdown: { ...METRICS.chunk_markdown },
    rank_cosine: { ...METRICS.rank_cosine },
  };
}

export function resetShadowMetricsForTest() {
  for (const state of Object.values(METRICS)) {
    state.comparisons = 0;
    state.matches = 0;
    state.mismatches = 0;
  }
}
