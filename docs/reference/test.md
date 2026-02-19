---
summary: "How to run tests locally (vitest) and when to use force/coverage modes"
read_when:
  - Running or fixing tests
title: "Tests"
---

# Tests

- Full testing kit (suites, live, Docker): [Testing](/help/testing)

- `pnpm test:force`: Kills any lingering gateway process holding the default control port, then runs the full Vitest suite with an isolated gateway port so server tests don’t collide with a running instance. Use this when a prior gateway run left port 18789 occupied.
- `pnpm test:coverage`: Runs the unit suite with V8 coverage (via `vitest.unit.config.ts`). Global thresholds are 70% lines/branches/functions/statements. Coverage excludes integration-heavy entrypoints (CLI wiring, gateway/telegram bridges, webchat static server) to keep the target focused on unit-testable logic.
- `pnpm test` on Node 24+: OpenClaw auto-disables Vitest `vmForks` and uses `forks` to avoid `ERR_VM_MODULE_LINK_FAILURE` / `module is already linked`. You can force behavior with `OPENCLAW_TEST_VM_FORKS=0|1`.
- `pnpm test:e2e`: Runs gateway end-to-end smoke tests (multi-instance WS/HTTP/node pairing). Defaults to `vmForks` + adaptive workers in `vitest.e2e.config.ts`; tune with `OPENCLAW_E2E_WORKERS=<n>` and set `OPENCLAW_E2E_VERBOSE=1` for verbose logs.
- `pnpm test:live`: Runs provider live tests (minimax/zai). Requires API keys and `LIVE=1` (or provider-specific `*_LIVE_TEST=1`) to unskip.

## Memory TS ↔ Rust parity and perf loop

For the memory-core Rust migration slice:

- `pnpm memory:native:build` — compile the Rust memory binary (`rust/openclaw-memory-core`).
- `pnpm test:memory:parity` — run fixture-based TS/Rust parity checks.
- `pnpm test:memory:fuzz` — run deterministic randomized TS/Rust parity checks.
- `pnpm test:memory:rust` — run the full memory suite with `OPENCLAW_MEMORY_ENGINE=rust`.
- `pnpm test:memory:shadow` — run the full memory suite with `OPENCLAW_MEMORY_ENGINE=shadow`.

Bench commands (local deterministic workloads):

- `pnpm bench:memory:index` — markdown chunk/index-style throughput across small/medium/large corpora.
- `pnpm bench:memory:ranking` — vector ranking throughput bench.
- `pnpm bench:memory:query` — query-style ranking bench.
- `pnpm bench:memory:compare` — consolidated TS vs Rust benchmark summary.
- `pnpm bench:memory:ci` — threshold gate (index >= 1.5x, query >= 2.0x) used in CI.
- `pnpm bench:gateway:parse` — gateway protocol parse/validation throughput and p50/p95 latency microbench.

Runtime toggle for integration experiments:

- `OPENCLAW_MEMORY_ENGINE=ts|rust|shadow` (default `rust`; auto-falls back to TS when native binary is unavailable)
- Rollback switch: set `OPENCLAW_MEMORY_ENGINE=ts` to force TypeScript-only memory execution.

## Model latency bench (local keys)

Script: [`scripts/bench-model.ts`](https://github.com/openclaw/openclaw/blob/main/scripts/bench-model.ts)

Usage:

- `source ~/.profile && pnpm tsx scripts/bench-model.ts --runs 10`
- Optional env: `MINIMAX_API_KEY`, `MINIMAX_BASE_URL`, `MINIMAX_MODEL`, `ANTHROPIC_API_KEY`
- Default prompt: “Reply with a single word: ok. No punctuation or extra text.”

Last run (2025-12-31, 20 runs):

- minimax median 1279ms (min 1114, max 2431)
- opus median 2454ms (min 1224, max 3170)

## Onboarding E2E (Docker)

Docker is optional; this is only needed for containerized onboarding smoke tests.

Full cold-start flow in a clean Linux container:

```bash
scripts/e2e/onboard-docker.sh
```

This script drives the interactive wizard via a pseudo-tty, verifies config/workspace/session files, then starts the gateway and runs `openclaw health`.

## QR import smoke (Docker)

Ensures `qrcode-terminal` loads under Node 22+ in Docker:

```bash
pnpm test:docker:qr
```
