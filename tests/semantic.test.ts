import { existsSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import index from "../src/data/exampleEmbeddings.json";
import examples from "../src/data/customerExamples.json";
import heldOut from "./fixtures/heldOutUtterances.json";
import { customers } from "../src/lib/matrix";
import { classify, dot, EMBED_OPTIONS, MODEL_ID, type EmbeddingIndex } from "../src/lib/similarity";

const idx = index as EmbeddingIndex;

describe("embedding index", () => {
  it("was built with the runtime model", () => {
    expect(idx.model).toBe(MODEL_ID);
    expect(idx.dims).toBe(384);
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
});

// Real-model accuracy check on lines the index has never seen. Needs `npm run setup-model`.
const modelPresent = existsSync(`public/models/${MODEL_ID}/onnx/model_quantized.onnx`);

describe.skipIf(!modelPresent)("classify (real model, held-out lines)", () => {
  let embed: (texts: string[]) => Promise<number[][]>;

  beforeAll(async () => {
    const { env, pipeline } = await import("@huggingface/transformers");
    env.allowRemoteModels = false;
    env.localModelPath = "public/models/";
    const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
    embed = async (texts) => (await extractor(texts, { ...EMBED_OPTIONS })).tolist() as number[][];
  }, 60_000);

  it("gets at least 80% of held-out lines right (top-1) and 95% within top-2", async () => {
    const vecs = await embed(heldOut.map((h) => h.text));
    let top1 = 0;
    let top2 = 0;
    const misses: string[] = [];
    heldOut.forEach((h, i) => {
      const { ranked } = classify(vecs[i], idx);
      if (ranked[0].customerId === h.expected) top1++;
      else misses.push(`${h.expected} → ${ranked[0].customerId}: ${h.text}`);
      if (ranked.slice(0, 2).some((r) => r.customerId === h.expected)) top2++;
    });
    console.log(`held-out top-1 ${top1}/${heldOut.length}, top-2 ${top2}/${heldOut.length}`);
    if (misses.length) console.log(misses.join("\n"));
    expect(top1 / heldOut.length).toBeGreaterThanOrEqual(0.8);
    expect(top2 / heldOut.length).toBeGreaterThanOrEqual(0.95);
  }, 60_000);
});
