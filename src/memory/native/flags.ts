export type MemoryEngine = "ts" | "rust" | "shadow";

export function resolveMemoryEngine(env: NodeJS.ProcessEnv = process.env): MemoryEngine {
  const raw = env.OPENCLAW_MEMORY_ENGINE?.trim().toLowerCase();
  if (raw === "ts" || raw === "rust" || raw === "shadow") {
    return raw;
  }
  return "rust";
}
