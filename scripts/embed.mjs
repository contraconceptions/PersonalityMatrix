// Pre-compute embeddings for src/data/customerExamples.json → src/data/exampleEmbeddings.json.
// Runs the same quantized model the extension bundles, so vectors are comparable at runtime.
// Re-run whenever the example lines change: `npm run embed`.
import { env, pipeline } from "@huggingface/transformers";
import { readFileSync, writeFileSync } from "node:fs";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2"; // keep in sync with src/lib/similarity.ts
env.allowRemoteModels = false;
env.localModelPath = "public/models/";

const examples = JSON.parse(readFileSync("src/data/customerExamples.json", "utf8"));
const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });

const items = [];
for (const [customerId, lines] of Object.entries(examples)) {
  const out = await extractor(lines, { pooling: "mean", normalize: true });
  out.tolist().forEach((vec, i) => {
    items.push({ customerId, text: lines[i], vector: vec.map((x) => Math.round(x * 1e5) / 1e5) });
  });
}

const index = { model: MODEL_ID, dims: items[0].vector.length, items };
writeFileSync("src/data/exampleEmbeddings.json", JSON.stringify(index));
console.log(`Embedded ${items.length} examples (${index.dims} dims).`);
