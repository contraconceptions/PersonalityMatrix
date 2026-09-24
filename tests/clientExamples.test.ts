import { describe, expect, it } from "vitest";
import index from "../src/data/exampleEmbeddings.json";
import { buildClientIndex, hashExamples, MAX_LINES, mergeIndex, validateExamples, type ClientExamples } from "../src/lib/clientExamples";
import { exportContent, mergeContent, validateContent } from "../src/lib/content";
import { customers } from "../src/lib/matrix";
import { classify, type EmbeddingIndex } from "../src/lib/similarity";

const ids = customers.map((c) => c.id);
const builtIn = index as EmbeddingIndex;

/** A deterministic stand-in for the model: a unit vector in the built-in index's space. */
const fakeEmbed = async (text: string) => {
  const v = new Array(builtIn.dims).fill(0);
  for (let i = 0; i < text.length; i++) v[(text.charCodeAt(i) * 31 + i) % builtIn.dims] += 1;
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

describe("validateExamples", () => {
  const check = (data: unknown, mode?: unknown) => {
    const errors: string[] = [];
    return { ex: validateExamples(data, mode, ids, errors), errors };
  };

  it("accepts lines per type and removes duplicates", () => {
    const { ex, errors } = check({ demanding: ["Get me a manager.", "Get me a manager.", " I'm cancelling. "] });
    expect(errors).toEqual([]);
    expect(ex).toEqual({ mode: "add", lines: { demanding: ["Get me a manager.", "I'm cancelling."] } });
  });

  it("rejects unknown types and non-text", () => {
    const { ex, errors } = check({ angry: ["x"], hesitant: [3] });
    expect(ex).toBeNull();
    expect(errors.join(" ")).toMatch(/angry.*not a customer type/);
    expect(errors.join(" ")).toMatch(/hesitant" must be a list of text/);
  });

  it("flags obvious personal data", () => {
    const { errors } = check({ cooperative: ["My email is jo@example.com", "Card 4111 1111 1111 1111"] });
    expect(errors.join(" ")).toMatch(/email address/);
    expect(errors.join(" ")).toMatch(/long number/);
  });

  it("requires every type when replacing the built-in examples", () => {
    expect(check({ demanding: ["a line", "b line", "c line"] }, "replace").errors.join(" ")).toMatch(/every type needs at least 3/);
  });

  it(`caps the import at ${MAX_LINES} lines`, () => {
    const lines = Array.from({ length: MAX_LINES + 1 }, (_, i) => `line number ${"x".repeat(i % 7)} ${i}`);
    expect(check({ analytical: lines }).errors.join(" ")).toMatch(/limit is/);
  });
});

describe("client index", () => {
  const ex: ClientExamples = { mode: "add", lines: { demanding: ["Put your boss on the phone.", "I'm reporting you to the ombudsman."] } };

  it("hashes independently of line order", () => {
    const flipped: ClientExamples = { mode: "add", lines: { demanding: [...ex.lines.demanding!].reverse() } };
    expect(hashExamples(flipped)).toBe(hashExamples(ex));
    expect(hashExamples({ ...ex, mode: "replace" })).not.toBe(hashExamples(ex));
  });

  it("embeds every line and reports progress", async () => {
    const progress: number[] = [];
    const idx = await buildClientIndex(ex, fakeEmbed, (done) => progress.push(done));
    expect(idx.items).toHaveLength(2);
    expect(idx.dims).toBe(builtIn.dims);
    expect(idx.hash).toBe(hashExamples(ex));
    expect(progress).toEqual([1, 2]);
  });

  it("fails as a whole when the model isn't available", async () => {
    await expect(buildClientIndex(ex, async () => null)).rejects.toThrow(/isn't available/);
  });

  it("adds to or replaces the built-in examples, and ignores a mismatched index", async () => {
    const idx = await buildClientIndex(ex, fakeEmbed);
    expect(mergeIndex(builtIn, idx).items).toHaveLength(builtIn.items.length + 2);
    expect(mergeIndex(builtIn, { ...idx, mode: "replace" }).items).toHaveLength(2);
    expect(mergeIndex(builtIn, { ...idx, model: "other-model" })).toBe(builtIn);
    expect(mergeIndex(builtIn, null)).toBe(builtIn);
  });

  it("changes recognition: a client line pulls its own phrasing toward its type", async () => {
    const line = "I'm reporting you to the ombudsman.";
    const q = await fakeEmbed(line);
    const idx = await buildClientIndex({ mode: "add", lines: { hesitant: [line, line + " "] } }, fakeEmbed);
    expect(classify(q, mergeIndex(builtIn, idx)).ranked[0].customerId).toBe("hesitant");
  });
});

describe("content import with example lines", () => {
  it("round-trips through import and export", () => {
    const v = validateContent({ customerExamplesMode: "add", customerExamples: { analytical: ["Which line item is the $4 charge?"] } });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const out = exportContent(mergeContent(v.overrides));
    expect(out.customerExamples).toEqual({ analytical: ["Which line item is the $4 charge?"] });
    expect(out.customerExamplesMode).toBe("add");
  });

  it("exports no example lines when none were imported", () => {
    expect(exportContent(mergeContent(null))).not.toHaveProperty("customerExamples");
  });
});
