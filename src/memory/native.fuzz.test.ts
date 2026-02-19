import { describe, expect, it } from "vitest";
import { chunkMarkdown, cosineSimilarity } from "./internal.js";
import {
  isMemoryNativeBinaryAvailable,
  runNativeChunkMarkdown,
  runNativeCosineSimilarity,
  runNativeRankCosine,
} from "./native/bridge.js";

const nativeAvailable = isMemoryNativeBinaryAvailable();
const fuzzSuite = nativeAvailable ? describe : describe.skip;

function createLcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function randomInt(rand: () => number, min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randomWord(rand: () => number, maxLen = 10) {
  const letters = "abcdefghijklmnopqrstuvwxyz0123456789";
  const len = randomInt(rand, 1, maxLen);
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += letters[Math.floor(rand() * letters.length)] ?? "a";
  }
  return out;
}

function randomText(rand: () => number, lines: number, wordsPerLine: number) {
  const output: string[] = [];
  for (let i = 0; i < lines; i += 1) {
    const words = Array.from({ length: wordsPerLine }, () => randomWord(rand));
    output.push(words.join(" "));
  }
  return output.join("\n");
}

fuzzSuite("memory native fuzz parity", () => {
  it("matches chunking on deterministic random corpora", () => {
    const rand = createLcg(9001);
    for (let i = 0; i < 40; i += 1) {
      const content = randomText(rand, randomInt(rand, 5, 80), randomInt(rand, 4, 14));
      const tokens = randomInt(rand, 8, 120);
      const overlap = randomInt(rand, 0, Math.max(0, tokens - 1));
      const tsChunks = chunkMarkdown(content, { tokens, overlap });
      const nativeChunks = runNativeChunkMarkdown({ content, tokens, overlap }).map((chunk) => ({
        startLine: chunk.start_line,
        endLine: chunk.end_line,
        text: chunk.text,
        hash: chunk.hash,
      }));
      expect(nativeChunks, `case-${i}`).toEqual(tsChunks);
    }
  });

  it("matches cosine similarity on deterministic random vectors", () => {
    const rand = createLcg(1337);
    for (let i = 0; i < 120; i += 1) {
      const a = Array.from({ length: randomInt(rand, 1, 64) }, () => rand() * 2 - 1);
      const b = Array.from({ length: randomInt(rand, 1, 64) }, () => rand() * 2 - 1);
      const tsScore = cosineSimilarity(a, b);
      const nativeScore = runNativeCosineSimilarity({ a, b });
      expect(Math.abs(nativeScore - tsScore), `case-${i}`).toBeLessThan(1e-12);
    }
  });

  it("matches ranking order and scores on deterministic random vectors", () => {
    const rand = createLcg(2026);
    for (let i = 0; i < 60; i += 1) {
      const dims = randomInt(rand, 8, 64);
      const candidateCount = randomInt(rand, 5, 80);
      const topK = randomInt(rand, 1, Math.min(16, candidateCount));
      const query = Array.from({ length: dims }, () => rand() * 2 - 1);
      const candidates = Array.from({ length: candidateCount }, (_, index) => ({
        id: `c-${index}`,
        embedding: Array.from({ length: dims }, () => rand() * 2 - 1),
      }));

      const tsRanked = candidates
        .map((candidate) => ({
          id: candidate.id,
          score: cosineSimilarity(query, candidate.embedding),
        }))
        .filter((entry) => Number.isFinite(entry.score))
        .toSorted((a, b) => b.score - a.score)
        .slice(0, topK);
      const nativeRanked = runNativeRankCosine({
        query,
        candidates,
        limit: topK,
      });
      expect(
        nativeRanked.map((entry) => entry.id),
        `ids-case-${i}`,
      ).toEqual(tsRanked.map((entry) => entry.id));
      for (let rank = 0; rank < nativeRanked.length; rank += 1) {
        const nativeScore = nativeRanked[rank]?.score ?? 0;
        const tsScore = tsRanked[rank]?.score ?? 0;
        expect(Math.abs(nativeScore - tsScore), `score-case-${i}-rank-${rank}`).toBeLessThan(1e-12);
      }
    }
  });
});
