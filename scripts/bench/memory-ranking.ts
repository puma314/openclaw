import { cosineSimilarity } from "../../src/memory/internal.js";
import {
  isMemoryNativeBinaryAvailable,
  runNativeBenchMemory,
  type NativeRankCandidate,
} from "../../src/memory/native/bridge.js";
import { createLcg, formatMs, formatSpeedup, parseIntArg } from "./memory-fixtures.ts";

function buildVectors(candidateCount: number, dims: number) {
  const rand = createLcg(123);
  const query = Array.from({ length: dims }, () => rand() * 2 - 1);
  const candidates = Array.from({ length: candidateCount }, (_, idx) => ({
    id: `c-${idx}`,
    embedding: Array.from({ length: dims }, () => rand() * 2 - 1),
  })) satisfies NativeRankCandidate[];
  return { query, candidates };
}

async function main() {
  const iterations = parseIntArg("--iters", 400);
  const candidateCount = parseIntArg("--candidates", 1200);
  const dims = parseIntArg("--dims", 256);
  const topK = parseIntArg("--limit", 8);
  const { query, candidates } = buildVectors(candidateCount, dims);

  const tsStarted = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) {
    candidates
      .map((candidate) => ({
        id: candidate.id,
        score: cosineSimilarity(query, candidate.embedding),
      }))
      .filter((entry) => Number.isFinite(entry.score))
      .toSorted((a, b) => b.score - a.score)
      .slice(0, topK);
  }
  const tsMs = Number(process.hrtime.bigint() - tsStarted) / 1e6;

  let rsMs: number | null = null;
  if (isMemoryNativeBinaryAvailable()) {
    const bench = runNativeBenchMemory({
      chunkIters: 0,
      rankIters: iterations,
      content: "bench",
      tokens: 16,
      overlap: 0,
      query,
      candidates,
      limit: topK,
    });
    rsMs = bench.rank_ms;
  }

  console.log(
    `Memory ranking benchmark (iters=${iterations}, candidates=${candidateCount}, dims=${dims}, topK=${topK})`,
  );
  console.log(`TS rank=${formatMs(tsMs)}`);
  console.log(`RS rank=${rsMs === null ? "n/a" : formatMs(rsMs)}`);
  console.log(`Speedup=${rsMs === null ? "n/a" : formatSpeedup(tsMs, rsMs)}`);
}

await main();
