import { chunkMarkdown, cosineSimilarity } from "../../src/memory/internal.js";
import {
  isMemoryNativeBinaryAvailable,
  runNativeBenchMemory,
  runNativeRankCosine,
  type NativeRankCandidate,
} from "../../src/memory/native/bridge.js";
import {
  buildCorpusText,
  createLcg,
  formatMs,
  formatSpeedup,
  parseIntArg,
  readCorpusSpecs,
} from "./memory-fixtures.ts";

function buildQueryCandidates(
  content: string,
  dims: number,
): {
  query: number[];
  candidates: NativeRankCandidate[];
} {
  const chunks = chunkMarkdown(content, { tokens: 160, overlap: 32 });
  const rand = createLcg(777);
  const query = Array.from({ length: dims }, () => rand() * 2 - 1);
  const candidates = chunks.map((chunk) => ({
    id: chunk.hash,
    embedding: Array.from({ length: dims }, () => rand() * 2 - 1),
  }));
  return { query, candidates };
}

async function main() {
  const iterations = parseIntArg("--iters", 150);
  const dims = parseIntArg("--dims", 192);
  const topK = parseIntArg("--limit", 6);
  const specs = await readCorpusSpecs();
  const fallbackSpec = specs[0];
  if (!fallbackSpec) {
    throw new Error("memory bench corpus fixture is empty");
  }
  const content = buildCorpusText(specs[1] ?? fallbackSpec);
  const { query, candidates } = buildQueryCandidates(content, dims);

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
    runNativeRankCosine({
      query,
      candidates,
      limit: topK,
    });
    rsMs = bench.rank_ms;
  }

  console.log(
    `Memory query benchmark (iters=${iterations}, candidates=${candidates.length}, dims=${dims})`,
  );
  console.log(`TS query-rank=${formatMs(tsMs)}`);
  console.log(`RS query-rank=${rsMs === null ? "n/a" : formatMs(rsMs)}`);
  console.log(`Speedup=${rsMs === null ? "n/a" : formatSpeedup(tsMs, rsMs)}`);
}

await main();
