import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chunkMarkdown, cosineSimilarity } from "./internal.js";
import {
  isMemoryNativeBinaryAvailable,
  runNativeBenchMemory,
  runNativeChunkMarkdown,
  runNativeCosineSimilarity,
  runNativeRankCosine,
} from "./native/bridge.js";

type ChunkFixture = {
  name: string;
  content: string;
  tokens: number;
  overlap: number;
};

type CosineFixture = {
  name: string;
  a: number[];
  b: number[];
};

type RankFixture = {
  name: string;
  query: number[];
  limit: number;
  candidates: Array<{ id: string; embedding: number[] }>;
};

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures",
);
const nativeAvailable = isMemoryNativeBinaryAvailable();
const paritySuite = nativeAvailable ? describe : describe.skip;

async function readFixture<T>(fixturePath: string): Promise<T> {
  const raw = await fs.readFile(path.join(fixtureRoot, fixturePath), "utf-8");
  return JSON.parse(raw) as T;
}

function decodeFixtureContent(content: string) {
  return content.replaceAll("\\n", "\n");
}

paritySuite("memory native parity", () => {
  it("matches chunkMarkdown output for canonical fixtures", async () => {
    const fixtures = await readFixture<ChunkFixture[]>("parity/memory/chunk-cases.json");
    for (const fixture of fixtures) {
      const content = decodeFixtureContent(fixture.content);
      const tsChunks = chunkMarkdown(content, {
        tokens: fixture.tokens,
        overlap: fixture.overlap,
      });
      const nativeChunks = runNativeChunkMarkdown({
        content,
        tokens: fixture.tokens,
        overlap: fixture.overlap,
      }).map((chunk) => ({
        startLine: chunk.start_line,
        endLine: chunk.end_line,
        text: chunk.text,
        hash: chunk.hash,
      }));
      expect(nativeChunks, fixture.name).toEqual(tsChunks);
    }
  });

  it("matches cosine similarity output for canonical fixtures", async () => {
    const fixtures = await readFixture<CosineFixture[]>("parity/memory/cosine-cases.json");
    for (const fixture of fixtures) {
      const tsScore = cosineSimilarity(fixture.a, fixture.b);
      const nativeScore = runNativeCosineSimilarity({ a: fixture.a, b: fixture.b });
      expect(Math.abs(nativeScore - tsScore), fixture.name).toBeLessThan(1e-12);
    }
  });

  it("matches ranking output for canonical fixtures", async () => {
    const fixtures = await readFixture<RankFixture[]>("parity/memory/rank-cases.json");
    for (const fixture of fixtures) {
      const tsRanked = fixture.candidates
        .map((candidate) => ({
          id: candidate.id,
          score: cosineSimilarity(fixture.query, candidate.embedding),
        }))
        .filter((entry) => Number.isFinite(entry.score))
        .toSorted((a, b) => b.score - a.score)
        .slice(0, fixture.limit);
      const nativeRanked = runNativeRankCosine({
        query: fixture.query,
        candidates: fixture.candidates,
        limit: fixture.limit,
      });
      expect(
        nativeRanked.map((entry) => entry.id),
        fixture.name,
      ).toEqual(tsRanked.map((entry) => entry.id));
      for (let i = 0; i < nativeRanked.length; i += 1) {
        const nativeScore = nativeRanked[i]?.score ?? 0;
        const tsScore = tsRanked[i]?.score ?? 0;
        expect(Math.abs(nativeScore - tsScore), `${fixture.name}#${i}`).toBeLessThan(1e-12);
      }
    }
  });

  it("bench API is callable and returns finite timing values", () => {
    const bench = runNativeBenchMemory({
      chunkIters: 2,
      rankIters: 2,
      content: "line one\nline two\nline three",
      tokens: 24,
      overlap: 4,
      query: [1, 0, 0],
      candidates: [
        { id: "a", embedding: [1, 0, 0] },
        { id: "b", embedding: [0, 1, 0] },
      ],
      limit: 2,
    });
    expect(bench.total_ms).toBeGreaterThanOrEqual(0);
    expect(bench.chunk_ms).toBeGreaterThanOrEqual(0);
    expect(bench.rank_ms).toBeGreaterThanOrEqual(0);
  });
});
