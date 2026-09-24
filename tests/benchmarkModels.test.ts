import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("npm run benchmark-models (stand-in embeddings)", () => {
  it("scores each model and reports a fitted temperature", () => {
    const run = spawnSync(process.execPath, ["scripts/benchmark-models.mjs", "--models", "Xenova/all-MiniLM-L6-v2,Xenova/e5-small-v2:query: "], {
      encoding: "utf8",
      env: { ...process.env, PM_FAKE_EMBEDDINGS: "1" },
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/model\s+dims\s+MB\s+ms\/line\s+temp\s+LOO emb\s+LOO \+cues\s+held-out\s+challenge/);
    expect(run.stdout).toMatch(/Xenova\/e5-small-v2 \("query: "\)\s+384/);
    expect(run.stdout).not.toMatch(/failed/);
  }, 60_000);
});
