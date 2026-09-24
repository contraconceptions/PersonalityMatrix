// Recognition yardstick (roadmap R1): `npm run eval`.
// 1. Leave-one-out on the stored example vectors: compares the runtime pipeline (class centroid + keyword
//    cues) with the previous rule (mean of top-3 neighbours), the centroid alone and a softmax
//    (logistic regression) classifier. Needs no model download. The cues were written with these
//    lines in view, so the "+ cues" row is optimistic; the embedding-only rows are the fair comparison.
// 2. If the model is present (`npm run setup-model`): top-1 / top-2 accuracy and a confusion table for the
//    held-out and challenge fixtures, using the same classify() the side panel uses.
// Loads the app's own TypeScript (src/lib/similarity.ts) through Vite, so it scores exactly what ships.
import { existsSync, readFileSync } from "node:fs";
import { runnerImport } from "vite";

const { module: similarity } = await runnerImport("./src/lib/similarity.ts");
const { classify, dot, EMBED_OPTIONS, MODEL_ID } = similarity;

const cues = JSON.parse(readFileSync("src/data/cues.json", "utf8"));

const read = (f) => JSON.parse(readFileSync(f, "utf8"));
const index = read("src/data/exampleEmbeddings.json");
const TYPES = [...new Set(index.items.map((i) => i.customerId))];
const pct = (n, d) => `${Math.round((n / d) * 100)}%`.padStart(4);

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

// The rule used before 2026-09-24, kept for comparison.
function topKNeighbours(q, train, k = 3) {
  return TYPES.map((t) => {
    const sims = train.filter((it) => it.customerId === t).map((it) => dot(q, it.vector)).sort((a, b) => b - a).slice(0, k);
    return { customerId: t, score: sims.reduce((a, b) => a + b, 0) / sims.length };
  }).sort((x, y) => y.score - x.score);
}

const rankers = {
  "top-3 neighbours (previous)": (q, train) => topKNeighbours(q, train),
  "class centroid": (q, train) => classify(q, { ...index, items: train }).ranked,
  "softmax regression": (q, train) => trainSoftmax(train)(q),
  "centroid + cues (runtime)": (q, train, text) => classify(q, { ...index, items: train }, { text, cues }).ranked,
};

console.log(`Leave-one-out on ${index.items.length} stored example vectors (${MODEL_ID})`);
for (const [name, rank] of Object.entries(rankers)) {
  let top1 = 0;
  let top2 = 0;
  index.items.forEach((it, i) => {
    const r = rank(it.vector, index.items.filter((_, j) => j !== i), it.text);
    if (r[0].customerId === it.customerId) top1++;
    if (r.slice(0, 2).some((x) => x.customerId === it.customerId)) top2++;
  });
  const n = index.items.length;
  console.log(`  ${name.padEnd(28)} top-1 ${pct(top1, n)}  top-2 ${pct(top2, n)}`);
}

// Multi-line calls: how the suggestion evolves as lines are committed (per-call accumulation).
const { module: callMemory } = await runnerImport("./src/lib/callMemory.ts");
const calls = read("tests/fixtures/callTranscripts.json");
function scoreCalls(label, vectorsFor) {
  let byLine = [0, 0, 0];
  console.log(`\nCalls (${label}): suggested type after each line, * = right`);
  calls.forEach((call, c) => {
    let memory = callMemory.emptyCall();
    const steps = call.lines.map((text, i) => {
      const line = classify(vectorsFor(c, i), index, { text, cues });
      const shown = callMemory.combine(line, memory);
      memory = callMemory.commit(memory, line);
      const ok = shown.confidence !== "none" && shown.ranked[0].customerId === call.expected;
      if (ok && i < 3) byLine[i]++;
      return shown.confidence === "none" ? "  —" : `${shown.ranked[0].customerId.slice(0, 5)}${ok ? "*" : " "}`;
    });
    console.log(`  ${call.expected.padEnd(12)} ${steps.join("  ")}`);
  });
  console.log(`  right after line 1/2/3: ${byLine.map((n) => `${n}/${calls.length}`).join(", ")}`);
}
scoreCalls("keywords only", () => null);

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
    const r = classify(vecs[i], index, { text: x.text, cues });
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

const callVecs = [];
for (const call of calls) callVecs.push((await extractor(call.lines, { ...EMBED_OPTIONS })).tolist());
scoreCalls("model + keywords", (c, i) => callVecs[c][i]);
