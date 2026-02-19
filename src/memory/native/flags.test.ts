import { describe, expect, it } from "vitest";
import { resolveMemoryEngine } from "./flags.js";

describe("resolveMemoryEngine", () => {
  it("defaults to ts when env is missing", () => {
    expect(resolveMemoryEngine({})).toBe("ts");
  });

  it("accepts rust and shadow values", () => {
    expect(resolveMemoryEngine({ OPENCLAW_MEMORY_ENGINE: "rust" })).toBe("rust");
    expect(resolveMemoryEngine({ OPENCLAW_MEMORY_ENGINE: "shadow" })).toBe("shadow");
  });

  it("normalizes whitespace and casing", () => {
    expect(resolveMemoryEngine({ OPENCLAW_MEMORY_ENGINE: " RuSt " })).toBe("rust");
  });

  it("falls back to ts for invalid values", () => {
    expect(resolveMemoryEngine({ OPENCLAW_MEMORY_ENGINE: "native" })).toBe("ts");
  });
});
