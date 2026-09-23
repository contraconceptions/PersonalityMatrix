import type { CustomerId } from "./types";

/** Must match scripts/embed.mjs — the index is invalid if these drift apart. */
export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const EMBED_OPTIONS = { pooling: "mean", normalize: true } as const;

export interface EmbeddingIndex {
  model: string;
  dims: number;
  items: Array<{ customerId: CustomerId; text: string; vector: number[] }>;
}

export interface Suggestion {
  customerId: CustomerId;
  /** Mean cosine similarity of this archetype's closest examples. */
  score: number;
  /** The single closest example line for this archetype. */
  example: string;
}

export interface Classification {
  ranked: Suggestion[];
  /** Clear winner vs. a close call between the top two. */
  confidence: "clear" | "close" | "none";
}

// Tuned against tests/fixtures/heldOutUtterances.json.
const TOP_K = 3;
const MIN_SCORE = 0.25;
const CLEAR_MARGIN = 0.04;

/** Vectors are L2-normalized, so the dot product is the cosine similarity. */
export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function classify(query: ArrayLike<number>, index: EmbeddingIndex): Classification {
  const byCustomer = new Map<CustomerId, Array<{ sim: number; text: string }>>();
  for (const item of index.items) {
    const list = byCustomer.get(item.customerId) ?? [];
    list.push({ sim: dot(query, item.vector), text: item.text });
    byCustomer.set(item.customerId, list);
  }

  const ranked: Suggestion[] = [...byCustomer].map(([customerId, sims]) => {
    sims.sort((a, b) => b.sim - a.sim);
    const top = sims.slice(0, TOP_K);
    return {
      customerId,
      score: top.reduce((s, x) => s + x.sim, 0) / top.length,
      example: top[0].text,
    };
  });
  ranked.sort((a, b) => b.score - a.score);

  const [first, second] = ranked;
  let confidence: Classification["confidence"] = "none";
  if (first && first.score >= MIN_SCORE) {
    confidence = !second || first.score - second.score >= CLEAR_MARGIN ? "clear" : "close";
  }
  return { ranked, confidence };
}
