import type { WorkerRequest, WorkerResponse } from "../sidepanel/embedder.worker";

export type ModelStatus = "idle" | "loading" | "ready" | "error";

// Lazily starts one shared worker and exposes a promise-based embed().
let worker: Worker | null = null;
let status: ModelStatus = "idle";
let nextId = 1;
const pending = new Map<number, (v: number[] | null) => void>();
const listeners = new Set<(s: ModelStatus) => void>();

function setStatus(s: ModelStatus) {
  status = s;
  listeners.forEach((l) => l(s));
}

function ensureWorker(): Worker {
  if (worker) return worker;
  setStatus("loading");
  worker = new Worker(new URL("../sidepanel/embedder.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    if (msg.type === "ready") setStatus("ready");
    else if (msg.type === "error") {
      console.error("[PersonalityMatrix] embedder:", msg.message);
      setStatus("error");
      pending.forEach((resolve) => resolve(null));
      pending.clear();
    } else {
      pending.get(msg.id)?.(msg.vector);
      pending.delete(msg.id);
    }
  };
  return worker;
}

/** Start loading the model early so the first suggestion is fast. */
export function warmUp(): void {
  ensureWorker();
}

export function onStatus(listener: (s: ModelStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

/** Resolves to the embedding, or null if the model failed to load. */
export function embed(text: string): Promise<number[] | null> {
  const w = ensureWorker();
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ id, text } satisfies WorkerRequest);
  });
}
