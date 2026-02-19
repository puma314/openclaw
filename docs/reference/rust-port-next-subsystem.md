---
summary: "How we selected the next TypeScript to Rust migration target after memory-core"
read_when:
  - Planning additional Rust migration slices
title: "Rust Port Next Subsystem Selection"
---

# Rust Port Next Subsystem Selection

After completing the memory-core migration slice, we rank next candidates using:

1. Measured CPU hot-path cost from deterministic local benchmarks.
2. Existing test coverage quality and ease of parity verification.
3. Blast radius and rollback safety.

## Current candidate ranking

1. Gateway protocol parse and validation hot path.
2. Auto-reply parser and directive handling utilities.
3. Session-utils transform paths.

## Baseline benchmark commands

- `pnpm bench:gateway:parse`
- `pnpm bench:auto-reply:parse`

The gateway benchmark focuses on `validateConnectParams` + `JSON.parse` + `validateRequestFrame`.
The auto-reply benchmark focuses on `parseInlineDirectives` and slash command parse flows.

## Latest baseline snapshot

Sample run:

- `pnpm bench:gateway:parse -- --iters 60000 --batch 300 --pool 128`
- `pnpm bench:auto-reply:parse -- --iters 60000 --batch 300 --pool 128`

Highlights:

- Gateway parse+validate frame: ~1.07M to ~1.08M ops/s (p95 ~0.0012-0.0013ms).
- Gateway validate connect: ~1.45M to ~1.73M ops/s (p95 ~0.0024-0.0026ms).
- Auto-reply inline directive parse: ~203k ops/s (p95 ~0.0064ms).
- Auto-reply slash parse: ~4.9M to ~11.5M ops/s.

## Selection decision

Next translation candidate remains **gateway protocol parse and validation** because:

- It is a central always-on hot path for every websocket request.
- It has strong existing integration coverage in gateway tests.
- It provides a constrained boundary for parity contracts before broader gateway refactors.

Auto-reply parser benchmarking remains in place to keep candidate #2 measurable and ready if
gateway integration tradeoffs change.
