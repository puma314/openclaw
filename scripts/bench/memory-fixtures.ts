import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type MemoryBenchCorpusSpec = {
  name: string;
  lines: number;
  tokensPerLine: number;
  seed: number;
};

export function createLcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

export function buildCorpusText(spec: MemoryBenchCorpusSpec): string {
  const rand = createLcg(spec.seed);
  const lines: string[] = [];
  for (let i = 0; i < spec.lines; i += 1) {
    const words = Array.from(
      { length: spec.tokensPerLine },
      () => `t${Math.floor(rand() * 100_000)}`,
    );
    lines.push(`${spec.name}-line-${i}: ${words.join(" ")}`);
  }
  return lines.join("\n");
}

export async function readCorpusSpecs() {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.resolve(moduleDir, "../../test/fixtures/bench/memory/corpus.json");
  const raw = await fs.readFile(fixturePath, "utf-8");
  return JSON.parse(raw) as MemoryBenchCorpusSpec[];
}

export function parseIntArg(flag: string, fallback: number): number {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) {
    return fallback;
  }
  const value = Number.parseInt(process.argv[idx + 1] ?? "", 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

export function parseFloatArg(flag: string): number | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) {
    return undefined;
  }
  const value = Number.parseFloat(process.argv[idx + 1] ?? "");
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

export function parseStringArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) {
    return undefined;
  }
  const value = process.argv[idx + 1]?.trim();
  return value ? value : undefined;
}

export function formatMs(value: number): string {
  return `${Math.round(value)}ms`;
}

export function formatSpeedup(tsMs: number, rustMs: number): string {
  if (!Number.isFinite(tsMs) || !Number.isFinite(rustMs) || rustMs <= 0) {
    return "n/a";
  }
  return `${(tsMs / rustMs).toFixed(2)}x`;
}
