import { parseSlashCommandOrNull } from "../../src/auto-reply/reply/commands-slash-parse.js";
import { parseInlineDirectives } from "../../src/auto-reply/reply/directive-handling.parse.js";
import { parseIntArg, createLcg } from "./memory-fixtures.ts";

type BenchResult = {
  scenario: string;
  ops: number;
  totalMs: number;
  opsPerSec: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
};

function percentile(values: number[], p: number) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].toSorted((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[index] ?? 0;
}

function runBatched(params: {
  scenario: string;
  iterations: number;
  batchSize: number;
  runOnce: () => void;
}): BenchResult {
  const perOpSamples: number[] = [];
  let completed = 0;
  const totalStart = process.hrtime.bigint();
  while (completed < params.iterations) {
    const remaining = params.iterations - completed;
    const size = Math.min(params.batchSize, remaining);
    const started = process.hrtime.bigint();
    for (let i = 0; i < size; i += 1) {
      params.runOnce();
    }
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    perOpSamples.push(elapsedMs / size);
    completed += size;
  }
  const totalMs = Number(process.hrtime.bigint() - totalStart) / 1e6;
  const avgMs =
    perOpSamples.reduce((sum, value) => sum + value, 0) / Math.max(1, perOpSamples.length);
  return {
    scenario: params.scenario,
    ops: params.iterations,
    totalMs,
    opsPerSec: params.iterations / (totalMs / 1000),
    avgMs,
    p50Ms: percentile(perOpSamples, 0.5),
    p95Ms: percentile(perOpSamples, 0.95),
  };
}

function formatMs(value: number) {
  return `${value.toFixed(4)}ms`;
}

function formatOps(value: number) {
  return `${Math.round(value).toLocaleString()} ops/s`;
}

function buildMessages(poolSize: number) {
  const rand = createLcg(20260219);
  const directivePool = Array.from({ length: poolSize }, (_, index) => {
    const mode = index % 3 === 0 ? "serial" : index % 3 === 1 ? "parallel" : "off";
    const verbosity = index % 2 === 0 ? "high" : "low";
    const think = index % 4 === 0 ? "hard" : "normal";
    const model = index % 5 === 0 ? "opus" : "gpt5";
    return `@openclaw queue:${mode} debounce:${100 + (index % 200)} cap:${1 + (index % 5)} drop:oldest think:${think} verbose:${verbosity} model:${model} please summarize PR #${1000 + index}`;
  });
  const slashPool = Array.from({ length: poolSize }, (_, index) => {
    if (index % 3 === 0) {
      return "/config";
    }
    if (index % 3 === 1) {
      return `/config set memory.sync.maxDocs ${100 + index}`;
    }
    return `/config set memory.sync.batchSize ${1 + (index % 16)}`;
  });
  const invalidSlashPool = Array.from({ length: poolSize }, (_, index) =>
    index % 2 === 0 ? "config set missing slash" : "/",
  );
  const pick = () => Math.floor(rand() * poolSize) % poolSize;
  return {
    nextDirective: () => directivePool[pick()] ?? directivePool[0] ?? "",
    nextSlash: () => slashPool[pick()] ?? slashPool[0] ?? "/config",
    nextInvalidSlash: () => invalidSlashPool[pick()] ?? invalidSlashPool[0] ?? "",
  };
}

function main() {
  const iterations = parseIntArg("--iters", 60_000);
  const batchSize = parseIntArg("--batch", 300);
  const poolSize = parseIntArg("--pool", 128);
  const messages = buildMessages(poolSize);

  const results: BenchResult[] = [
    runBatched({
      scenario: "parse-inline-directives(valid)",
      iterations,
      batchSize,
      runOnce: () => {
        const parsed = parseInlineDirectives(messages.nextDirective(), {
          modelAliases: ["opus", "gpt5", "haiku"],
          disableElevated: false,
          allowStatusDirective: true,
        });
        if (!parsed.cleaned) {
          throw new Error("directive parser produced empty cleaned body");
        }
      },
    }),
    runBatched({
      scenario: "parse-slash(valid)",
      iterations,
      batchSize,
      runOnce: () => {
        const parsed = parseSlashCommandOrNull(messages.nextSlash(), "/config", {
          invalidMessage: "invalid /config command",
          defaultAction: "show",
        });
        if (!parsed || !parsed.ok) {
          throw new Error("valid slash command failed to parse");
        }
      },
    }),
    runBatched({
      scenario: "parse-slash(invalid)",
      iterations,
      batchSize,
      runOnce: () => {
        const parsed = parseSlashCommandOrNull(messages.nextInvalidSlash(), "/config", {
          invalidMessage: "invalid /config command",
          defaultAction: "show",
        });
        if (parsed !== null && parsed.ok) {
          throw new Error("invalid slash command unexpectedly parsed");
        }
      },
    }),
  ];

  console.log(
    `Auto-reply parse benchmark (iters=${iterations}, batch=${batchSize}, pool=${poolSize})`,
  );
  console.log("scenario\ttotal\tops/s\tavg-op\tp50-op\tp95-op");
  for (const result of results) {
    console.log(
      `${result.scenario}\t${formatMs(result.totalMs)}\t${formatOps(result.opsPerSec)}\t${formatMs(result.avgMs)}\t${formatMs(result.p50Ms)}\t${formatMs(result.p95Ms)}`,
    );
  }
}

main();
