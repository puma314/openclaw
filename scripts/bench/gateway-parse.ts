import { validateConnectParams, validateRequestFrame } from "../../src/gateway/protocol/index.js";
import { createLcg, parseIntArg } from "./memory-fixtures.ts";

type BenchSample = {
  avgOpMs: number;
};

type BenchResult = {
  name: string;
  ops: number;
  totalMs: number;
  opsPerSec: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
};

type ParsedFrame = {
  type?: string;
  id?: string;
  method?: string;
  params?: unknown;
};

const CLIENT_TEMPLATE = {
  id: "test",
  version: "1.0.0",
  platform: "bench",
  mode: "test",
} as const;

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].toSorted((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx] ?? 0;
}

function runBatchedBench(params: {
  name: string;
  iterations: number;
  batchSize: number;
  runOnce: () => void;
}): BenchResult {
  const samples: BenchSample[] = [];
  const totalStart = process.hrtime.bigint();
  let completed = 0;

  while (completed < params.iterations) {
    const remaining = params.iterations - completed;
    const size = Math.min(params.batchSize, remaining);
    const started = process.hrtime.bigint();
    for (let i = 0; i < size; i += 1) {
      params.runOnce();
    }
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    samples.push({ avgOpMs: elapsedMs / size });
    completed += size;
  }

  const totalMs = Number(process.hrtime.bigint() - totalStart) / 1e6;
  const perOp = samples.map((sample) => sample.avgOpMs);
  return {
    name: params.name,
    ops: params.iterations,
    totalMs,
    opsPerSec: params.iterations / (totalMs / 1000),
    avgMs: perOp.reduce((sum, value) => sum + value, 0) / Math.max(1, perOp.length),
    p50Ms: percentile(perOp, 0.5),
    p95Ms: percentile(perOp, 0.95),
  };
}

function buildFrames(seed: number, poolSize: number) {
  const rand = createLcg(seed);
  const validConnectParams = Array.from({ length: poolSize }, (_, idx) => ({
    minProtocol: 1,
    maxProtocol: 1,
    client: {
      ...CLIENT_TEMPLATE,
      version: `1.0.${idx % 10}`,
    },
    caps: [],
    role: "operator",
  }));

  const validFrames = validConnectParams.map((params, idx) => ({
    type: "req",
    id: `bench-req-${idx}`,
    method: "connect",
    params,
  }));

  const invalidFrames = validFrames.map((frame) => ({ ...frame, type: "bad" }));

  const validPayloads = validFrames.map((frame) => JSON.stringify(frame));
  const invalidPayloads = invalidFrames.map((frame) => JSON.stringify(frame));

  const nextIndex = () => Math.floor(rand() * poolSize) % poolSize;
  return {
    nextValidConnect: () => validConnectParams[nextIndex()],
    nextInvalidConnect: () => ({
      minProtocol: 1,
      maxProtocol: "bad",
      client: {
        ...CLIENT_TEMPLATE,
        id: "bench-client-invalid",
      },
    }),
    nextValidFramePayload: () => validPayloads[nextIndex()] ?? validPayloads[0] ?? "{}",
    nextInvalidFramePayload: () => invalidPayloads[nextIndex()] ?? invalidPayloads[0] ?? "{}",
  };
}

function formatMs(value: number) {
  return `${value.toFixed(4)}ms`;
}

function formatOpsPerSec(value: number) {
  return `${Math.round(value).toLocaleString()} ops/s`;
}

function runBenchmarks() {
  const iterations = parseIntArg("--iters", 40_000);
  const batchSize = parseIntArg("--batch", 250);
  const poolSize = parseIntArg("--pool", 128);
  const frames = buildFrames(20260219, poolSize);

  const results: BenchResult[] = [
    runBatchedBench({
      name: "validate-connect(valid)",
      iterations,
      batchSize,
      runOnce: () => {
        const ok = validateConnectParams(frames.nextValidConnect());
        if (!ok) {
          throw new Error("valid connect params rejected");
        }
      },
    }),
    runBatchedBench({
      name: "validate-connect(invalid)",
      iterations,
      batchSize,
      runOnce: () => {
        const ok = validateConnectParams(frames.nextInvalidConnect());
        if (ok) {
          throw new Error("invalid connect params accepted");
        }
      },
    }),
    runBatchedBench({
      name: "parse+validate-frame(valid)",
      iterations,
      batchSize,
      runOnce: () => {
        const payload = frames.nextValidFramePayload();
        const parsed = JSON.parse(payload) as ParsedFrame;
        const ok = validateRequestFrame(parsed);
        if (!ok) {
          throw new Error("valid request frame rejected");
        }
      },
    }),
    runBatchedBench({
      name: "parse+validate-frame(invalid)",
      iterations,
      batchSize,
      runOnce: () => {
        const payload = frames.nextInvalidFramePayload();
        const parsed = JSON.parse(payload) as ParsedFrame;
        const ok = validateRequestFrame(parsed);
        if (ok) {
          throw new Error("invalid request frame accepted");
        }
      },
    }),
  ];

  console.log(
    `Gateway protocol parse benchmark (iters=${iterations}, batch=${batchSize}, pool=${poolSize})`,
  );
  console.log("scenario\ttotal\tops/s\tavg-op\tp50-op\tp95-op");
  for (const result of results) {
    console.log(
      `${result.name}\t${formatMs(result.totalMs)}\t${formatOpsPerSec(result.opsPerSec)}\t${formatMs(result.avgMs)}\t${formatMs(result.p50Ms)}\t${formatMs(result.p95Ms)}`,
    );
  }
}

runBenchmarks();
