import { chunkMarkdown, cosineSimilarity } from "../../src/memory/internal.js";
import {
  isMemoryNativeBinaryAvailable,
  runNativeBenchMemory,
  type NativeRankCandidate,
} from "../../src/memory/native/bridge.js";

type BenchArgs = {
  chunkIters: number;
  rankIters: number;
  candidateCount: number;
  vectorDims: number;
};

type BenchSummary = {
  chunkMs: number;
  rankMs: number;
  totalMs: number;
};

function parseIntArg(flag: string, fallback: number): number {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) {
    return fallback;
  }
  const raw = process.argv[idx + 1];
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function parseArgs(): BenchArgs {
  return {
    chunkIters: parseIntArg("--chunk-iters", 200),
    rankIters: parseIntArg("--rank-iters", 500),
    candidateCount: parseIntArg("--candidates", 1000),
    vectorDims: parseIntArg("--dims", 256),
  };
}

function createLcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function buildFixture(args: BenchArgs): {
  content: string;
  query: number[];
  candidates: NativeRankCandidate[];
} {
  const rand = createLcg(42);
  const lines: string[] = [];
  for (let i = 0; i < 2200; i += 1) {
    const tokens = Array.from({ length: 14 }, () => `t${Math.floor(rand() * 10_000)}`).join(" ");
    lines.push(`line-${i}: ${tokens}`);
  }
  const content = lines.join("\n");

  const query = Array.from({ length: args.vectorDims }, () => rand() * 2 - 1);
  const candidates = Array.from({ length: args.candidateCount }, (_, idx) => ({
    id: `c-${idx}`,
    embedding: Array.from({ length: args.vectorDims }, () => rand() * 2 - 1),
  }));
  return { content, query, candidates };
}

function benchTs(params: {
  content: string;
  chunkIters: number;
  rankIters: number;
  query: number[];
  candidates: NativeRankCandidate[];
}): BenchSummary {
  const started = process.hrtime.bigint();
  const chunkStarted = process.hrtime.bigint();
  for (let i = 0; i < params.chunkIters; i += 1) {
    chunkMarkdown(params.content, { tokens: 160, overlap: 32 });
  }
  const chunkMs = Number(process.hrtime.bigint() - chunkStarted) / 1e6;

  const rankStarted = process.hrtime.bigint();
  for (let i = 0; i < params.rankIters; i += 1) {
    params.candidates
      .map((candidate) => ({
        id: candidate.id,
        score: cosineSimilarity(params.query, candidate.embedding),
      }))
      .filter((entry) => Number.isFinite(entry.score))
      .toSorted((a, b) => b.score - a.score)
      .slice(0, 8);
  }
  const rankMs = Number(process.hrtime.bigint() - rankStarted) / 1e6;
  const totalMs = Number(process.hrtime.bigint() - started) / 1e6;
  return { chunkMs, rankMs, totalMs };
}

function formatMs(value: number): string {
  return `${Math.round(value)}ms`;
}

function formatSpeedup(tsMs: number, rustMs: number): string {
  if (!Number.isFinite(tsMs) || !Number.isFinite(rustMs) || rustMs <= 0) {
    return "n/a";
  }
  const speedup = tsMs / rustMs;
  return `${speedup.toFixed(2)}x`;
}

async function main() {
  const args = parseArgs();
  const fixture = buildFixture(args);

  const ts = benchTs({
    content: fixture.content,
    chunkIters: args.chunkIters,
    rankIters: args.rankIters,
    query: fixture.query,
    candidates: fixture.candidates,
  });

  console.log("Memory benchmark (TypeScript vs Rust)");
  console.log(
    `Workload: chunkIters=${args.chunkIters}, rankIters=${args.rankIters}, candidates=${args.candidateCount}, dims=${args.vectorDims}`,
  );
  console.log("");
  console.log(
    `TS chunk=${formatMs(ts.chunkMs)} rank=${formatMs(ts.rankMs)} total=${formatMs(ts.totalMs)}`,
  );

  if (!isMemoryNativeBinaryAvailable()) {
    console.log("");
    console.log(
      'Rust binary not found. Run "pnpm memory:native:build" and rerun this benchmark for TS vs Rust comparison.',
    );
    return;
  }

  const rust = runNativeBenchMemory({
    chunkIters: args.chunkIters,
    rankIters: args.rankIters,
    content: fixture.content,
    tokens: 160,
    overlap: 32,
    query: fixture.query,
    candidates: fixture.candidates,
    limit: 8,
  });

  console.log(
    `RS chunk=${formatMs(rust.chunk_ms)} rank=${formatMs(rust.rank_ms)} total=${formatMs(rust.total_ms)}`,
  );
  console.log(
    `Speedup chunk=${formatSpeedup(ts.chunkMs, rust.chunk_ms)} rank=${formatSpeedup(ts.rankMs, rust.rank_ms)} total=${formatSpeedup(ts.totalMs, rust.total_ms)}`,
  );
}

await main();
