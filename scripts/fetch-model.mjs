// One-time setup for local semantic search. Everything must ship inside the extension — MV3 forbids
// remote code, and the panel must work offline. Downloads the model named in src/data/model.json into
// public/models/ (git-ignored; re-run with --force to refresh). The ONNX Runtime WASM binary is bundled by Vite.
// Models whose id starts with "local/" (e.g. a fine-tuned client model) are never downloaded.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** transformers.js file naming per dtype. Keep in sync with modelFile() in src/lib/similarity.ts. */
export const ONNX_FILE = { fp32: "onnx/model.onnx", fp16: "onnx/model_fp16.onnx", q8: "onnx/model_quantized.onnx", q4: "onnx/model_q4.onnx" };

export function modelFiles(dtype) {
  return ["config.json", "tokenizer.json", "tokenizer_config.json", ONNX_FILE[dtype] ?? ONNX_FILE.q8];
}

export async function downloadModel(id, dtype = "q8", { force = false, quiet = false } = {}) {
  const dir = join("public", "models", id);
  const missing = modelFiles(dtype).filter((f) => force || !existsSync(join(dir, f)));
  if (!missing.length) return dir;
  if (id.startsWith("local/")) {
    throw new Error(`${id} is a local model and can't be downloaded. Copy its folder into public/models/${id}/ (missing: ${missing.join(", ")}).`);
  }
  for (const file of missing) {
    const url = `https://huggingface.co/${id}/resolve/main/${file}`;
    if (!quiet) process.stdout.write(`Downloading ${id}/${file}… `);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const dest = join(dir, file);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    if (!quiet) console.log("done");
  }
  return dir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { id, dtype } = JSON.parse(readFileSync("src/data/model.json", "utf8"));
  await downloadModel(id, dtype, { force: process.argv.includes("--force") });
  console.log(`Model ready: ${id} (${dtype}).`);
}
