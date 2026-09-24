/// <reference lib="webworker" />
// Runs the embedding model off the UI thread. Everything loads from the extension package:
// no remote models, no CDN-hosted WASM (MV3 forbids remote code, and the panel must work offline).
import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import { EMBED_OPTIONS, MODEL_DTYPE, MODEL_ID, modelInput } from "../lib/similarity";

// Guard: this worker may only fetch files packaged with the extension. Nothing the agent
// types can leave the device, and any accidental CDN/Hub fallback fails loudly.
const nativeFetch = self.fetch.bind(self);
self.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input), self.location.href);
  if (url.origin !== self.location.origin) {
    return Promise.reject(new Error(`Blocked non-local fetch: ${url.href}`));
  }
  return nativeFetch(input, init);
};

export type WorkerRequest = { id: number; text: string };
export type WorkerResponse =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "result"; id: number; vector: number[] };

env.allowRemoteModels = false;
env.allowLocalModels = true;
// Must be root-relative, not a full URL: transformers.js v4 skips its local-file check for
// http(s) URLs and then silently builds an empty tokenizer ("this.tokenizer is not a function").
env.localModelPath = "/models/";
env.useBrowserCache = false;
// transformers.js defaults wasmPaths to the jsDelivr CDN. Point it at the copy Vite bundles
// instead; the JS glue is already inlined in onnxruntime-web's bundle build.
const wasm = env.backends.onnx.wasm as { wasmPaths?: unknown; numThreads?: number };
wasm.wasmPaths = { wasm: ortWasmUrl };
wasm.numThreads = 1; // multi-threading needs cross-origin isolation, which extension pages lack

const post = (msg: WorkerResponse) => self.postMessage(msg);

// Load, then run one warm-up inference so a broken model surfaces as an error right away
// (not on the agent's first real input) and the first real suggestion is fast.
const ready: Promise<FeatureExtractionPipeline> = (async () => {
  const extractor = (await pipeline("feature-extraction", MODEL_ID, {
    dtype: MODEL_DTYPE,
    device: "wasm",
  })) as FeatureExtractionPipeline;
  await extractor(modelInput("warm up"), { ...EMBED_OPTIONS });
  return extractor;
})();

ready.then(
  () => post({ type: "ready" }),
  (err: unknown) => post({ type: "error", message: String(err) }),
);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, text } = e.data;
  try {
    const extractor = await ready;
    const out = await extractor(modelInput(text), { ...EMBED_OPTIONS });
    post({ type: "result", id, vector: Array.from(out.data as Float32Array) });
  } catch (err) {
    post({ type: "error", message: String(err) });
  }
};
