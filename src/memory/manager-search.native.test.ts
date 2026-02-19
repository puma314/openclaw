import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeBridgeMock = vi.hoisted(() => ({
  isMemoryNativeBinaryAvailable: vi.fn(),
  runNativeRankCosine: vi.fn(),
}));

vi.mock("./native/bridge.js", () => nativeBridgeMock);

function createDbRows() {
  return [
    {
      id: "a",
      path: "memory/a.md",
      start_line: 1,
      end_line: 1,
      text: "alpha",
      embedding: JSON.stringify([1, 0]),
      source: "memory",
    },
    {
      id: "b",
      path: "memory/b.md",
      start_line: 1,
      end_line: 1,
      text: "beta",
      embedding: JSON.stringify([0, 1]),
      source: "memory",
    },
    {
      id: "c",
      path: "memory/c.md",
      start_line: 1,
      end_line: 1,
      text: "gamma",
      embedding: JSON.stringify([0.5, 0.5]),
      source: "memory",
    },
  ];
}

function createDbMock() {
  return {
    prepare: () => ({
      all: () => createDbRows(),
    }),
  };
}

describe("searchVector native ranking modes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    nativeBridgeMock.isMemoryNativeBinaryAvailable.mockReset();
    nativeBridgeMock.isMemoryNativeBinaryAvailable.mockReturnValue(true);
    nativeBridgeMock.runNativeRankCosine.mockReset();
  });

  it("uses native ranking output in rust mode", async () => {
    vi.stubEnv("OPENCLAW_MEMORY_ENGINE", "rust");
    nativeBridgeMock.runNativeRankCosine.mockReturnValue([
      { id: "c", score: 0.9 },
      { id: "a", score: 0.8 },
    ]);
    const { searchVector } = await import("./manager-search.js");
    const results = await searchVector({
      db: createDbMock() as never,
      vectorTable: "chunks_vec",
      providerModel: "model",
      queryVec: [1, 0],
      limit: 2,
      snippetMaxChars: 700,
      ensureVectorReady: async () => false,
      sourceFilterVec: { sql: "", params: [] },
      sourceFilterChunks: { sql: "", params: [] },
    });
    expect(results.map((entry) => entry.id)).toEqual(["c", "a"]);
    expect(results[0]?.score).toBe(0.9);
  });

  it("falls back to TypeScript ranking when native ranking throws", async () => {
    vi.stubEnv("OPENCLAW_MEMORY_ENGINE", "rust");
    nativeBridgeMock.runNativeRankCosine.mockImplementation(() => {
      throw new Error("native fail");
    });
    const { searchVector } = await import("./manager-search.js");
    const results = await searchVector({
      db: createDbMock() as never,
      vectorTable: "chunks_vec",
      providerModel: "model",
      queryVec: [1, 0],
      limit: 2,
      snippetMaxChars: 700,
      ensureVectorReady: async () => false,
      sourceFilterVec: { sql: "", params: [] },
      sourceFilterChunks: { sql: "", params: [] },
    });
    expect(results.map((entry) => entry.id)).toEqual(["a", "c"]);
  });

  it("falls back to TypeScript ranking when native binary is unavailable", async () => {
    vi.stubEnv("OPENCLAW_MEMORY_ENGINE", "rust");
    nativeBridgeMock.isMemoryNativeBinaryAvailable.mockReturnValue(false);
    const { searchVector } = await import("./manager-search.js");
    const results = await searchVector({
      db: createDbMock() as never,
      vectorTable: "chunks_vec",
      providerModel: "model",
      queryVec: [1, 0],
      limit: 2,
      snippetMaxChars: 700,
      ensureVectorReady: async () => false,
      sourceFilterVec: { sql: "", params: [] },
      sourceFilterChunks: { sql: "", params: [] },
    });
    expect(results.map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(nativeBridgeMock.runNativeRankCosine).not.toHaveBeenCalled();
  });

  it("returns TypeScript ranking in shadow mode", async () => {
    vi.stubEnv("OPENCLAW_MEMORY_ENGINE", "shadow");
    nativeBridgeMock.runNativeRankCosine.mockReturnValue([
      { id: "c", score: 0.99 },
      { id: "b", score: 0.98 },
    ]);
    const { searchVector } = await import("./manager-search.js");
    const results = await searchVector({
      db: createDbMock() as never,
      vectorTable: "chunks_vec",
      providerModel: "model",
      queryVec: [1, 0],
      limit: 2,
      snippetMaxChars: 700,
      ensureVectorReady: async () => false,
      sourceFilterVec: { sql: "", params: [] },
      sourceFilterChunks: { sql: "", params: [] },
    });
    expect(results.map((entry) => entry.id)).toEqual(["a", "c"]);
  });
});
