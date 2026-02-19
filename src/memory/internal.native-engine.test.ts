import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeBridgeMock = vi.hoisted(() => ({
  isMemoryNativeBinaryAvailable: vi.fn(() => true),
  runNativeChunkMarkdown: vi.fn(),
}));

vi.mock("./native/bridge.js", () => nativeBridgeMock);

describe("chunkMarkdown native engine modes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    nativeBridgeMock.isMemoryNativeBinaryAvailable.mockReset();
    nativeBridgeMock.isMemoryNativeBinaryAvailable.mockReturnValue(true);
    nativeBridgeMock.runNativeChunkMarkdown.mockReset();
  });

  it("uses Rust output in rust mode", async () => {
    nativeBridgeMock.runNativeChunkMarkdown.mockReturnValue([
      {
        start_line: 1,
        end_line: 1,
        text: "native",
        hash: "native-hash",
      },
    ]);
    vi.stubEnv("OPENCLAW_MEMORY_ENGINE", "rust");
    const { chunkMarkdown } = await import("./internal.js");
    const result = chunkMarkdown("hello", { tokens: 20, overlap: 0 });
    expect(result).toEqual([
      {
        startLine: 1,
        endLine: 1,
        text: "native",
        hash: "native-hash",
      },
    ]);
  });

  it("falls back to TypeScript output when native call fails", async () => {
    nativeBridgeMock.runNativeChunkMarkdown.mockImplementation(() => {
      throw new Error("boom");
    });
    const { chunkMarkdown } = await import("./internal.js");
    const tsResult = chunkMarkdown("one\ntwo\nthree", { tokens: 20, overlap: 0 });
    vi.stubEnv("OPENCLAW_MEMORY_ENGINE", "rust");
    const rustResult = chunkMarkdown("one\ntwo\nthree", { tokens: 20, overlap: 0 });
    expect(rustResult).toEqual(tsResult);
  });

  it("falls back to TypeScript output when native binary is unavailable", async () => {
    nativeBridgeMock.isMemoryNativeBinaryAvailable.mockReturnValue(false);
    vi.stubEnv("OPENCLAW_MEMORY_ENGINE", "rust");
    const { chunkMarkdown } = await import("./internal.js");
    const result = chunkMarkdown("one\ntwo\nthree", { tokens: 20, overlap: 0 });
    expect(result.map((entry) => entry.text)).toEqual(["one\ntwo\nthree"]);
    expect(nativeBridgeMock.runNativeChunkMarkdown).not.toHaveBeenCalled();
  });

  it("returns TypeScript result in shadow mode", async () => {
    nativeBridgeMock.runNativeChunkMarkdown.mockReturnValue([
      {
        start_line: 1,
        end_line: 1,
        text: "native-shadow",
        hash: "native-shadow-hash",
      },
    ]);
    const { chunkMarkdown } = await import("./internal.js");
    vi.stubEnv("OPENCLAW_MEMORY_ENGINE", "ts");
    const tsResult = chunkMarkdown("alpha\nbeta", { tokens: 20, overlap: 0 });
    vi.stubEnv("OPENCLAW_MEMORY_ENGINE", "shadow");
    const shadowResult = chunkMarkdown("alpha\nbeta", { tokens: 20, overlap: 0 });
    expect(shadowResult).toEqual(tsResult);
  });
});
