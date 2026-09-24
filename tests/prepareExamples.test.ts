import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateContent } from "../src/lib/content";

describe("npm run prepare-examples", () => {
  it("turns the labeling template into a valid import file and a held-out set", () => {
    const out = mkdtempSync(join(tmpdir(), "pm-examples-"));
    const run = spawnSync(process.execPath, ["scripts/prepare-examples.mjs", "docs/examples/labeling-template.csv", out], { encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/Agreement: 86% of 7 lines/); // the template has one deliberate disagreement
    const file = JSON.parse(readFileSync(join(out, "client-examples.json"), "utf8"));
    expect(validateContent(file).ok).toBe(true);
    const lines = Object.values(file.customerExamples as Record<string, string[]>).flat();
    const heldOut = JSON.parse(readFileSync(join(out, "client-heldout.json"), "utf8")) as Array<{ text: string }>;
    expect(lines.length + heldOut.length).toBe(6); // the disagreed line is dropped
    expect(lines.join(" ")).not.toMatch(/pay by the 15th/);
  }, 30_000);
});
