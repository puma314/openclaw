import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "../../../");
const nativeBinaryName =
  process.platform === "win32" ? "openclaw-memory-core.exe" : "openclaw-memory-core";
const defaultNativeBinaryPath = path.join(repoRoot, "rust", "target", "release", nativeBinaryName);

type NativeChunk = {
  start_line: number;
  end_line: number;
  text: string;
  hash: string;
};

export type NativeRankCandidate = {
  id: string;
  embedding: number[];
};

type MemoryNativeRequest =
  | {
      op: "chunk_markdown";
      content: string;
      tokens: number;
      overlap: number;
    }
  | {
      op: "cosine_similarity";
      a: number[];
      b: number[];
    }
  | {
      op: "rank_cosine";
      query: number[];
      candidates: NativeRankCandidate[];
      limit: number;
    }
  | {
      op: "bench_memory";
      chunk_iters: number;
      rank_iters: number;
      content: string;
      tokens: number;
      overlap: number;
      query: number[];
      candidates: NativeRankCandidate[];
      limit: number;
    };

type MemoryNativeEnvelope<T> = {
  ok: boolean;
  result?: T;
  error?: string;
};

export type MemoryNativeBenchResult = {
  chunk_ms: number;
  rank_ms: number;
  total_ms: number;
  chunk_count: number;
  rank_count: number;
};

export function resolveMemoryNativeBinaryPath(): string {
  const configured = process.env.OPENCLAW_MEMORY_NATIVE_BIN?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return defaultNativeBinaryPath;
}

export function isMemoryNativeBinaryAvailable(
  binaryPath = resolveMemoryNativeBinaryPath(),
): boolean {
  return fs.existsSync(binaryPath);
}

function runNativeRequest<T>(request: MemoryNativeRequest): T {
  const binaryPath = resolveMemoryNativeBinaryPath();
  if (!isMemoryNativeBinaryAvailable(binaryPath)) {
    throw new Error(
      `memory native binary not found at ${binaryPath}; run "pnpm memory:native:build" first`,
    );
  }

  const result = spawnSync(binaryPath, {
    input: JSON.stringify(request),
    encoding: "utf-8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`memory native execution failed: ${String(result.error)}`);
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(
      `memory native process exited with ${result.status}: ${stderr || stdout || "unknown error"}`,
    );
  }

  let parsed: MemoryNativeEnvelope<T>;
  try {
    parsed = JSON.parse(result.stdout || "{}") as MemoryNativeEnvelope<T>;
  } catch (err) {
    throw new Error(`memory native returned invalid JSON: ${String(err)}`, { cause: err });
  }
  if (!parsed.ok) {
    throw new Error(parsed.error || "memory native request failed");
  }
  if (parsed.result === undefined) {
    throw new Error("memory native request did not return a result");
  }
  return parsed.result;
}

export function runNativeChunkMarkdown(params: {
  content: string;
  tokens: number;
  overlap: number;
}) {
  return runNativeRequest<NativeChunk[]>({
    op: "chunk_markdown",
    content: params.content,
    tokens: params.tokens,
    overlap: params.overlap,
  });
}

export function runNativeCosineSimilarity(params: { a: number[]; b: number[] }) {
  return runNativeRequest<{ score: number }>({
    op: "cosine_similarity",
    a: params.a,
    b: params.b,
  }).score;
}

export function runNativeRankCosine(params: {
  query: number[];
  candidates: NativeRankCandidate[];
  limit: number;
}) {
  return runNativeRequest<Array<{ id: string; score: number }>>({
    op: "rank_cosine",
    query: params.query,
    candidates: params.candidates,
    limit: params.limit,
  });
}

export function runNativeBenchMemory(params: {
  chunkIters: number;
  rankIters: number;
  content: string;
  tokens: number;
  overlap: number;
  query: number[];
  candidates: NativeRankCandidate[];
  limit: number;
}) {
  return runNativeRequest<MemoryNativeBenchResult>({
    op: "bench_memory",
    chunk_iters: params.chunkIters,
    rank_iters: params.rankIters,
    content: params.content,
    tokens: params.tokens,
    overlap: params.overlap,
    query: params.query,
    candidates: params.candidates,
    limit: params.limit,
  });
}
