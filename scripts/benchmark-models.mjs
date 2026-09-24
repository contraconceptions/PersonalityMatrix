// Compare embedding models for customer-type recognition (roadmap R4): `npm run benchmark-models`.
//
//   npm run benchmark-models -- [--models id[:prefix],…] [--examples client-examples.json] [--heldout client-heldout.json]
//
// For each model it downloads the weights (unless the id starts with "local/", e.g. a fine-tuned client model
// from training/setfit/), embeds the example lines, fits the temperature, and reports:
//   size, speed per line, leave-one-out accuracy on the examples (embedding only, and with keyword cues),
//   and accuracy on the held-out, challenge and (optional) client held-out lines — all with the same
//   classify() the panel uses. Real client lines (NEXT-STEPS §4) are what the decision should rest on.
// To switch: put the winner's id, prefix and fitted temperature in src/data/model.json, then
// `npm run setup-model && npm run embed && npm test && npm run eval`.
//
// PM_FAKE_EMBEDDINGS=1 replaces the model with a deterministic stand-in (no download) to check the
// script itself; its numbers mean nothing.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { runnerImport } from "vite";
import { downloadModel, ONNX_FILE } from "./fetch-model.mjs";

const read = (f) => JSON.parse(readFileSync(f, "utf8"));
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const FAKE = process.env.PM_FAKE_EMBEDDINGS === "1";
const DTYPE = "q8";
const TEMPERATURES = [0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1];

// Similar-size candidates (≈ 23–35 MB quantized, 384 dimensions). e5 expects a "query: " prefix.
const DEFAULT_MODELS = ["Xenova/all-MiniLM-L6-v2", "Xenova/bge-small-en-v1.5", "Xenova/gte-small", "Xenova/e5-small-v2:query: "];
const models = (arg("--models")?.split(",") ?? DEFAULT_MODELS).map((m) => {
  const i = m.indexOf(":");
  return i < 0 ? { id: m, prefix: "" } : { id: m.slice(0, i), prefix: m.slice(i + 1) };
});

const { module: sim } = await runnerImport("./src/lib/similarity.ts");
const { module: clientExamples } = await runnerImport("./src/lib/clientExamples.ts");
const cues = read("src/data/cues.json");
const TYPES = read("src/data/customerProfiles.json").map((c) => c.id);

const examples = Object.entries(read("src/data/customerExamples.json")).flatMap(([customerId, lines]) =>
  lines.map((text) => ({ customerId, text })),
);
if (arg("--examples")) {
  const file = read(arg("--examples"));
  const errors = [];
  const ex = clientExamples.validateExamples(file.customerExamples, file.customerExamplesMode, TYPES, errors);
  if (!ex) throw new Error(`${arg("--examples")}: ${errors.join("; ")}`);
  const client = Object.entries(ex.lines).flatMap(([customerId, lines]) => lines.map((text) => ({ customerId, text })));
  examples.splice(ex.mode === "replace" ? 0 : examples.length, ex.mode === "replace" ? examples.length : 0, ...client);
}
const sets = [
  ["held-out", read("tests/fixtures/heldOutUtterances.json")],
  ["challenge", read("tests/fixtures/challengeUtterances.json")],
  ...(arg("--heldout") ? [["client held-out", read(arg("--heldout"))]] : []),
];

function fakeEmbedder() {
  const vec = (t) => {
    const v = new Array(384).fill(0);
    for (let i = 0; i < t.length; i++) v[(t.charCodeAt(i) * 31 + i) % 384] += 1;
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  };
  return async (texts) => texts.map(vec);
}

async function loadEmbedder({ id, prefix }) {
  if (FAKE) return fakeEmbedder();
  await downloadModel(id, DTYPE, { quiet: true });
  const { env, pipeline } = await import("@huggingface/transformers");
  env.allowRemoteModels = false;
  env.localModelPath = "public/models/";
  const pipe = await pipeline("feature-extraction", id, { dtype: DTYPE });
  return async (texts) => (await pipe(texts.map((t) => prefix + t), { ...sim.EMBED_OPTIONS })).tolist();
}

const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "–");

async function benchmark(model) {
  const embed = await loadEmbedder(model);
  const vectors = await embed(examples.map((e) => e.text));
  const items = examples.map((e, i) => ({ ...e, vector: vectors[i] }));
  const index = { model: model.id, dims: vectors[0].length, items };

  // Leave-one-out: fit the temperature (with cues, as the panel runs) by log-likelihood, and score accuracy.
  const loo = (temperature, withCues) => {
    let right = 0;
    let nll = 0;
    items.forEach((it, i) => {
      const train = { ...index, items: items.filter((_, j) => j !== i) };
      const r = sim.classify(it.vector, train, withCues ? { text: it.text, cues, temperature } : { temperature });
      const p = r.ranked.find((x) => x.customerId === it.customerId)?.score ?? 1e-9;
      nll -= Math.log(Math.max(p, 1e-9));
      if (r.ranked[0].customerId === it.customerId) right++;
    });
    return { right, nll };
  };
  const fits = TEMPERATURES.map((t) => ({ t, ...loo(t, true) })).sort((a, b) => a.nll - b.nll);
  const temperature = fits[0].t;
  const embOnly = loo(temperature, false).right;

  const scores = [];
  for (const [, set] of sets) {
    const v = await embed(set.map((x) => x.text));
    const right = set.filter((x, i) => sim.classify(v[i], index, { text: x.text, cues, temperature }).ranked[0].customerId === x.expected).length;
    scores.push(pct(right, set.length));
  }

  // Speed: one line at a time, as in the panel (after a warm-up).
  const probe = examples.slice(0, 20).map((e) => e.text);
  await embed([probe[0]]);
  const times = [];
  for (const t of probe) {
    const t0 = performance.now();
    await embed([t]);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);

  const file = join("public", "models", model.id, ONNX_FILE[DTYPE]);
  const mb = !FAKE && existsSync(file) ? (statSync(file).size / 1e6).toFixed(1) : "–";
  return [model.id + (model.prefix ? ` ("${model.prefix}")` : ""), String(index.dims), mb, times[times.length >> 1].toFixed(1), String(temperature), pct(embOnly, items.length), pct(fits[0].right, items.length), ...scores];
}

const header = ["model", "dims", "MB", "ms/line", "temp", "LOO emb", "LOO +cues", ...sets.map(([n]) => n)];
const rows = [];
const failures = [];
for (const m of models) {
  try {
    rows.push(await benchmark(m));
  } catch (e) {
    rows.push([m.id, "failed"]);
    failures.push(`${m.id}: ${e instanceof Error ? e.message : e}`);
  }
}
if (FAKE) console.log("PM_FAKE_EMBEDDINGS=1: stand-in vectors, the numbers below are meaningless.\n");
console.log(`${examples.length} example lines; LOO = leave-one-out on them. The cues were written with the built-in lines in view, so "+cues" is optimistic there.\n`);
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
const line = (r) => r.map((c, i) => (c ?? "").padEnd(widths[i])).join("  ");
console.log(line(header));
console.log(widths.map((w) => "-".repeat(w)).join("  "));
for (const r of rows) console.log(line(r));
if (failures.length) console.log(`\n${failures.join("\n")}`);
