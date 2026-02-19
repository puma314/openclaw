import { chunkMarkdown } from "../../src/memory/internal.js";
import {
  isMemoryNativeBinaryAvailable,
  runNativeBenchMemory,
  type NativeRankCandidate,
} from "../../src/memory/native/bridge.js";
import {
  buildCorpusText,
  formatMs,
  formatSpeedup,
  parseIntArg,
  parseStringArg,
  readCorpusSpecs,
} from "./memory-fixtures.ts";

type BenchRow = {
  corpus: string;
  tsMs: number;
  rsMs: number | null;
  speedup: string;
};

async function main() {
  const corpusFilter = parseStringArg("--corpus");
  const iterations = parseIntArg("--iters", 80);
  const specs = await readCorpusSpecs();
  const selected = corpusFilter ? specs.filter((spec) => spec.name === corpusFilter) : specs;
  if (selected.length === 0) {
    throw new Error(`No corpus found for --corpus ${corpusFilter}`);
  }

  const rows: BenchRow[] = [];
  for (const spec of selected) {
    const content = buildCorpusText(spec);

    const tsStarted = process.hrtime.bigint();
    for (let i = 0; i < iterations; i += 1) {
      chunkMarkdown(content, { tokens: 160, overlap: 32 });
    }
    const tsMs = Number(process.hrtime.bigint() - tsStarted) / 1e6;

    let rsMs: number | null = null;
    if (isMemoryNativeBinaryAvailable()) {
      const bench = runNativeBenchMemory({
        chunkIters: iterations,
        rankIters: 0,
        content,
        tokens: 160,
        overlap: 32,
        query: [1, 0, 0],
        candidates: [{ id: "stub", embedding: [1, 0, 0] } satisfies NativeRankCandidate],
        limit: 1,
      });
      rsMs = bench.chunk_ms;
    }

    rows.push({
      corpus: spec.name,
      tsMs,
      rsMs,
      speedup: rsMs === null ? "n/a" : formatSpeedup(tsMs, rsMs),
    });
  }

  console.log(`Memory index benchmark (iters=${iterations})`);
  console.log("corpus\tts\trust\tspeedup");
  for (const row of rows) {
    console.log(
      `${row.corpus}\t${formatMs(row.tsMs)}\t${row.rsMs === null ? "n/a" : formatMs(row.rsMs)}\t${row.speedup}`,
    );
  }
}

await main();
