import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMemorySearchManager } from "./index.js";
import "./test-runtime-mocks.js";

vi.mock("./embeddings.js", () => ({
  createEmbeddingProvider: async () => ({
    requestedProvider: "openai",
    provider: {
      id: "mock",
      model: "mock-embed",
      embedQuery: async () => [0.1, 0.2],
      embedBatch: async (texts: string[]) => texts.map(() => [0.1, 0.2]),
    },
  }),
}));

describe("memory status native metrics", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-memory-status-"));
    await fs.mkdir(path.join(root, "memory"), { recursive: true });
    await fs.writeFile(path.join(root, "memory", "note.md"), "hello memory");
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("includes memory engine and shadow metrics in status custom payload", async () => {
    const storePath = path.join(root, "index.sqlite");
    const result = await getMemorySearchManager({
      agentId: "main",
      cfg: {
        agents: {
          defaults: {
            workspace: root,
            memorySearch: {
              provider: "openai",
              model: "mock-embed",
              store: {
                path: storePath,
                vector: { enabled: false },
              },
              sync: { watch: false, onSearch: false, onSessionStart: false },
            },
          },
          list: [{ id: "main", default: true }],
        },
      },
    });
    expect(result.manager).not.toBeNull();
    const status = result.manager!.status();
    expect(status.custom?.memoryEngine).toBeTypeOf("string");
    expect(status.custom?.shadowMetrics).toMatchObject({
      chunk_markdown: expect.objectContaining({
        comparisons: expect.any(Number),
        matches: expect.any(Number),
        mismatches: expect.any(Number),
      }),
      rank_cosine: expect.objectContaining({
        comparisons: expect.any(Number),
        matches: expect.any(Number),
        mismatches: expect.any(Number),
      }),
    });
    await result.manager?.close?.();
  });
});
