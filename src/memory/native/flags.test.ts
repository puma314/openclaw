import { describe, expect, it } from "vitest";
import { resolveMemoryEngine } from "./flags.js";

describe("resolveMemoryEngine", () => {
  it("defaults to rust when env is missing", () => {
    expect(resolveMemoryEngine({})).toBe("rust");
  });

  it("accepts ts, rust, and shadow values", () => {
    expect(resolveMemoryEngine({ OPENCLAW_MEMORY_ENGINE: "ts" })).toBe("ts");
    expect(resolveMemoryEngine({ OPENCLAW_MEMORY_ENGINE: "rust" })).toBe("rust");
    expect(resolveMemoryEngine({ OPENCLAW_MEMORY_ENGINE: "shadow" })).toBe("shadow");
  });

  it("normalizes whitespace and casing", () => {
    expect(resolveMemoryEngine({ OPENCLAW_MEMORY_ENGINE: " RuSt " })).toBe("rust");
  });

  it("falls back to rust for invalid values", () => {
    expect(resolveMemoryEngine({ OPENCLAW_MEMORY_ENGINE: "native" })).toBe("rust");
  });
});
