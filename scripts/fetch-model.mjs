// One-time setup for Phase 2 (local semantic search). Everything must ship inside the
// extension — MV3 forbids remote code, and the panel must work offline.
// Downloads the quantized all-MiniLM-L6-v2 model into public/models/ (git-ignored;
// re-run with --force to refresh). The ONNX Runtime WASM binary is bundled by Vite.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const force = process.argv.includes("--force");
const MODEL = "Xenova/all-MiniLM-L6-v2";
const FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"];
const modelDir = join("public", "models", MODEL);

for (const file of FILES) {
  const dest = join(modelDir, file);
  if (existsSync(dest) && !force) continue;
  const url = `https://huggingface.co/${MODEL}/resolve/main/${file}`;
  process.stdout.write(`Downloading ${file}… `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log("done");
}

console.log("Model ready.");
