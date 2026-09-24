// Recognition yardstick (roadmap R1): `npm run eval`.
// 1. Leave-one-out on the stored example vectors: compares the runtime rule (mean of top-3 neighbours)
//    with a class centroid and a softmax (logistic regression) classifier. Needs no model download.
// 2. If the model is present (`npm run setup-model`): top-1 / top-2 accuracy and a confusion table for the
//    held-out and challenge fixtures, using the same classify() the side panel uses.
// Imports src/lib/similarity.ts directly, so it needs Node 22.18+ (built-in TypeScript type stripping).
import { existsSync, readFileSync } from "node:fs";
import { classify, dot, EMBED_OPTIONS, MODEL_ID } from "../src/lib/similarity.ts";

const read = (f) => JSON.parse(readFileSync(f, "utf8"));
const index = read("src/data/exampleEmbeddings.json");
const TYPES = [...new Set(index.items.map((i) => i.customerId))];
const pct = (n, d) => `${Math.round((n / d) * 100)}%`.padStart(4);

function centroids(items) {
  return Object.fromEntries(
    TYPES.map((t) => {
      const v = new Array(index.dims).fill(0);
      for (const it of items) if (it.customerId === t) it.vector.forEach((x, i) => (v[i] += x));
      const n = Math.hypot(...v);
      return [t, v.map((x) => x / n)];
    }),
  );
}

// Softmax regression, full-batch gradient descent with L2. Vectors are unit length, so scale inputs.
function trainSoftmax(items, { epochs = 250, lr = 0.5, l2 = 0.01, scale = 10 } = {}) {
  const W = TYPES.map(() => new Float64Array(index.dims));
  const b = new Float64Array(TYPES.length);
  for (let e = 0; e < epochs; e++) {
    const gW = TYPES.map(() => new Float64Array(index.dims));
    const gb = new Float64Array(TYPES.length);
    for (const it of items) {
      const z = TYPES.map((_, c) => dot(W[c], it.vector) * scale + b[c]);
      const m = Math.max(...z);
      const p = z.map((v) => Math.exp(v - m));
      const s = p.reduce((a, x) => a + x, 0);
      TYPES.forEach((t, c) => {
        const g = p[c] / s - (t === it.customerId ? 1 : 0);
        gb[c] += g;
        for (let i = 0; i < index.dims; i++) gW[c][i] += g * it.vector[i] * scale;
      });
    }
    TYPES.forEach((_, c) => {
      b[c] -= (lr * gb[c]) / items.length;
      for (let i = 0; i < index.dims; i++) W[c][i] -= lr * (gW[c][i] / items.length + l2 * W[c][i]);
    });
  }
  return (q) => TYPES.map((t, c) => ({ customerId: t, score: dot(W[c], q) * scale + b[c] })).sort((x, y) => y.score - x.score);
}

const rankers = {
  "top-3 neighbours (runtime)": (q, train) => classify(q, { ...index, items: train }).ranked,
  "class centroid": (q, train) => {
    const c = centroids(train);
    return TYPES.map((t) => ({ customerId: t, score: dot(q, c[t]) })).sort((x, y) => y.score - x.score);
  },
  "softmax regression": (q, train) => trainSoftmax(train)(q),
};

console.log(`Leave-one-out on ${index.items.length} stored example vectors (${MODEL_ID})`);
for (const [name, rank] of Object.entries(rankers)) {
  let top1 = 0;
  let top2 = 0;
  index.items.forEach((it, i) => {
    const r = rank(it.vector, index.items.filter((_, j) => j !== i));
    if (r[0].customerId === it.customerId) top1++;
    if (r.slice(0, 2).some((x) => x.customerId === it.customerId)) top2++;
  });
  const n = index.items.length;
  console.log(`  ${name.padEnd(28)} top-1 ${pct(top1, n)}  top-2 ${pct(top2, n)}`);
}

if (!existsSync(`public/models/${MODEL_ID}/onnx/model_quantized.onnx`)) {
  console.log("\nModel not found: run `npm run setup-model` to also score the held-out and challenge fixtures.");
  process.exit(0);
}

const { env, pipeline } = await import("@huggingface/transformers");
env.allowRemoteModels = false;
env.localModelPath = "public/models/";
const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });

for (const file of ["tests/fixtures/heldOutUtterances.json", "tests/fixtures/challengeUtterances.json"]) {
  const set = read(file);
  const vecs = (await extractor(set.map((x) => x.text), { ...EMBED_OPTIONS })).tolist();
  const confusion = Object.fromEntries(TYPES.map((t) => [t, Object.fromEntries(TYPES.map((u) => [u, 0]))]));
  let top1 = 0;
  let top2 = 0;
  const conf = { clear: [0, 0], close: [0, 0], none: [0, 0] };
  const misses = [];
  set.forEach((x, i) => {
    const r = classify(vecs[i], index);
    const got = r.ranked[0].customerId;
    confusion[x.expected][got]++;
    conf[r.confidence][1]++;
    if (got === x.expected) {
      top1++;
      conf[r.confidence][0]++;
    } else misses.push(`  ${x.expected} → ${got} (${r.confidence})${x.trap ? ` [${x.trap}]` : ""}: ${x.text}`);
    if (r.ranked.slice(0, 2).some((s) => s.customerId === x.expected)) top2++;
  });
  console.log(`\n${file}: top-1 ${pct(top1, set.length)}  top-2 ${pct(top2, set.length)}  (n=${set.length})`);
  console.log(
    "  right when confidence is " +
      Object.entries(conf)
        .filter(([, [, n]]) => n)
        .map(([k, [ok, n]]) => `${k} ${ok}/${n}`)
        .join(", "),
  );
  console.log("  confusion (rows = expected, cols = suggested):");
  console.log("  " + "".padEnd(12) + TYPES.map((t) => t.slice(0, 5).padStart(6)).join(""));
  for (const t of TYPES) console.log("  " + t.padEnd(12) + TYPES.map((u) => String(confusion[t][u] || ".").padStart(6)).join(""));
  if (misses.length) console.log(misses.join("\n"));
}
