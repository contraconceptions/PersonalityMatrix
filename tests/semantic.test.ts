import { existsSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import index from "../src/data/exampleEmbeddings.json";
import examples from "../src/data/customerExamples.json";
import heldOut from "./fixtures/heldOutUtterances.json";
import { cues, customers } from "../src/lib/matrix";
import { classify, dot, EMBED_OPTIONS, MODEL_DTYPE, MODEL_FILE, MODEL_ID, modelInput, type EmbeddingIndex } from "../src/lib/similarity";

const idx = index as EmbeddingIndex;

describe("embedding index", () => {
  it("was built with the runtime model", () => {
    expect(idx.model).toBe(MODEL_ID);
    expect(idx.dims).toBe(idx.items[0].vector.length);
  });

  it("covers every customer archetype and every example line", () => {
    const total = Object.values(examples).reduce((n, lines) => n + lines.length, 0);
    expect(idx.items).toHaveLength(total);
    for (const c of customers) {
      expect(idx.items.some((i) => i.customerId === c.id), c.id).toBe(true);
    }
  });

  it("is up to date with customerExamples.json (re-run `npm run embed` if this fails)", () => {
    const texts = new Set(idx.items.map((i) => i.text));
    for (const lines of Object.values(examples)) for (const l of lines) expect(texts.has(l), l).toBe(true);
  });

  it("stores normalized vectors", () => {
    for (const item of idx.items.slice(0, 10)) expect(dot(item.vector, item.vector)).toBeCloseTo(1, 3);
  });
});

describe("classify (synthetic vectors)", () => {
  const toy: EmbeddingIndex = {
    model: MODEL_ID,
    dims: 2,
    items: [
      { customerId: "analytical", text: "a1", vector: [1, 0] },
      { customerId: "analytical", text: "a2", vector: [0.9, 0.436] },
      { customerId: "demanding", text: "d1", vector: [0, 1] },
    ],
  };

  it("ranks the nearest archetype first and reports its closest example", () => {
    const r = classify([1, 0], toy);
    expect(r.ranked[0]).toMatchObject({ customerId: "analytical", example: "a1" });
    expect(r.confidence).toBe("clear");
  });

  it("reports a close call when the top two are nearly tied", () => {
    const v = Math.SQRT1_2;
    const tie: EmbeddingIndex = { ...toy, items: [toy.items[0], toy.items[2]] };
    expect(classify([v, v], tie).confidence).toBe("close");
  });

  it("reports none when nothing is similar", () => {
    expect(classify([-1, 0], { ...toy, items: [toy.items[0]] }).confidence).toBe("none");
  });

  it("returns probabilities that sum to 1", () => {
    const r = classify([0.6, 0.8], toy);
    expect(r.ranked.reduce((s, x) => s + x.score, 0)).toBeCloseTo(1, 6);
  });

  it("lets keyword cues tip a close call, and reports them", () => {
    const v = Math.SQRT1_2;
    const tie: EmbeddingIndex = { ...toy, items: [toy.items[0], toy.items[2]] };
    const r = classify([v, v], tie, { text: "I want a supervisor", cues });
    expect(r.ranked[0].customerId).toBe("demanding");
    expect(r.cues[0]).toMatchObject({ customerId: "demanding", match: "supervisor" });
  });
});

describe("classify (keyword-only, model unavailable)", () => {
  it("suggests from cues alone when there's no embedding", () => {
    const r = classify(null, idx, { text: "This is ridiculous, I want a supervisor right now", cues });
    expect(r.keywordOnly).toBe(true);
    expect(r.ranked[0].customerId).toBe("demanding");
    expect(r.confidence).toBe("clear");
  });

  it("says nothing without cues", () => {
    expect(classify(null, idx, { text: "hello, can you hear me", cues }).confidence).toBe("none");
  });

  it("gets the demo lines right from keywords alone", async () => {
    const { scenarios } = await import("../src/lib/demo");
    for (const s of scenarios) expect(classify(null, idx, { text: s.customerLine, cues }).ranked[0].customerId, s.id).toBe(s.expectedCustomerId);
  });
});

// Real-model accuracy check on lines the index has never seen. Needs `npm run setup-model`.
const modelPresent = existsSync(`public/models/${MODEL_ID}/${MODEL_FILE}`);

describe.skipIf(!modelPresent)("classify (real model, held-out lines)", () => {
  let embed: (texts: string[]) => Promise<number[][]>;

  beforeAll(async () => {
    const { env, pipeline } = await import("@huggingface/transformers");
    env.allowRemoteModels = false;
    env.localModelPath = "public/models/";
    const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: MODEL_DTYPE });
    embed = async (texts) => (await extractor(texts.map(modelInput), { ...EMBED_OPTIONS })).tolist() as number[][];
  }, 60_000);

  it("gets at least 80% of held-out lines right (top-1) and 95% within top-2", async () => {
    const vecs = await embed(heldOut.map((h) => h.text));
    let top1 = 0;
    let top2 = 0;
    const misses: string[] = [];
    heldOut.forEach((h, i) => {
      const { ranked } = classify(vecs[i], idx, { text: h.text, cues });
      if (ranked[0].customerId === h.expected) top1++;
      else misses.push(`${h.expected} → ${ranked[0].customerId}: ${h.text}`);
      if (ranked.slice(0, 2).some((r) => r.customerId === h.expected)) top2++;
    });
    console.log(`held-out top-1 ${top1}/${heldOut.length}, top-2 ${top2}/${heldOut.length}`);
    if (misses.length) console.log(misses.join("\n"));
    expect(top1 / heldOut.length).toBeGreaterThanOrEqual(0.8);
    expect(top2 / heldOut.length).toBeGreaterThanOrEqual(0.95);
  }, 60_000);

  it("suggests the intended customer type for every demo scenario, with a clear margin", async () => {
    const { scenarios } = await import("../src/lib/demo");
    const vecs = await embed(scenarios.map((s) => s.customerLine));
    scenarios.forEach((s, i) => {
      const r = classify(vecs[i], idx, { text: s.customerLine, cues });
      expect(r.ranked[0].customerId, s.id).toBe(s.expectedCustomerId);
      expect(r.confidence, s.id).toBe("clear");
    });
  }, 60_000);
});
