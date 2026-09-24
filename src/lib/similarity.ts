import { detectCues, type CueHit } from "./cues";
import type { CueFamily, CustomerId } from "./types";

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
  /** Probability (0–1) after combining the embedding and keyword cues. */
  score: number;
  /** The single closest example line for this archetype ("" when keyword-only). */
  example: string;
}

export interface Classification {
  ranked: Suggestion[];
  /** Clear winner vs. a close call between the top two. */
  confidence: "clear" | "close" | "none";
  /** Keyword cues found in the text, strongest first (the "why" shown to the agent). */
  cues: CueHit[];
  /** True when no embedding was available and only keyword cues were used. */
  keywordOnly: boolean;
  /** Per-type log-probabilities, for combining lines across a call (see callMemory.ts). */
  logProbs: Record<CustomerId, number>;
  /** False when the line is unlike every example and has no cues: it carries no evidence. */
  signal: boolean;
}

export interface ClassifyOptions {
  /** The typed line; enables keyword cues. */
  text?: string;
  cues?: CueFamily[];
}

// Calibrated by leave-one-out on the example vectors (scripts/eval.mjs; docs/research/recognition-analysis.md).
// Each type is represented by the normalized mean of its examples (centroid), which beat nearest-neighbour
// voting 86% vs 74% leave-one-out. Logit = cosine / TEMPERATURE + CUE_WEIGHT × cue score.
const TEMPERATURE = 0.04;
const CUE_WEIGHT = 1;
/** Keyword-only mode (model not loaded): cues are the only evidence, so they count a bit more. */
const CUE_ONLY_WEIGHT = 1.5;
/** Below this cosine the line isn't like any example; without cues that's "none". */
const MIN_SCORE = 0.25;
/** In leave-one-out, every suggestion at or above this probability was right (60/60). */
const CLEAR_PROB = 0.7;
const MIN_PROB = 0.4;

/** Vectors are L2-normalized, so the dot product is the cosine similarity. */
export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

const centroidCache = new WeakMap<EmbeddingIndex, Map<CustomerId, number[]>>();

/** Normalized mean vector of each type's examples. */
export function centroids(index: EmbeddingIndex): Map<CustomerId, number[]> {
  let c = centroidCache.get(index);
  if (c) return c;
  c = new Map();
  for (const item of index.items) {
    const v = c.get(item.customerId) ?? new Array(item.vector.length).fill(0);
    item.vector.forEach((x, i) => (v[i] += x));
    c.set(item.customerId, v);
  }
  for (const v of c.values()) {
    const n = Math.hypot(...v) || 1;
    v.forEach((x, i) => (v[i] = x / n));
  }
  centroidCache.set(index, c);
  return c;
}

function logSoftmax(z: number[]): number[] {
  const m = Math.max(...z);
  const lse = m + Math.log(z.reduce((s, v) => s + Math.exp(v - m), 0));
  return z.map((v) => v - lse);
}

/** Turn per-type log-probabilities into a ranked classification. */
export function rank(
  logProbs: Record<CustomerId, number>,
  opts: { examples?: Partial<Record<CustomerId, string>>; cues?: CueHit[]; keywordOnly?: boolean; noSignal?: boolean } = {},
): Classification {
  const ranked = (Object.entries(logProbs) as Array<[CustomerId, number]>)
    .map(([customerId, lp]) => ({ customerId, score: Math.exp(lp), example: opts.examples?.[customerId] ?? "" }))
    .sort((a, b) => b.score - a.score);
  const [first, second] = ranked;
  let confidence: Classification["confidence"] = "none";
  if (first && !opts.noSignal && first.score >= MIN_PROB) {
    confidence = !second || first.score >= CLEAR_PROB ? "clear" : "close";
  }
  return { ranked, confidence, cues: opts.cues ?? [], keywordOnly: Boolean(opts.keywordOnly), logProbs, signal: !opts.noSignal };
}

/**
 * Classify one line. `query` is its embedding, or null when the model isn't available (keyword-only).
 * Scores: centroid cosine (temperature-scaled) plus keyword cues, as a softmax over the index's types.
 */
export function classify(
  query: ArrayLike<number> | null,
  index: EmbeddingIndex,
  { text, cues: families }: ClassifyOptions = {},
): Classification {
  const cents = centroids(index);
  const types = [...cents.keys()];
  const found = text && families ? detectCues(text, families) : { scores: {}, hits: [] };
  const cue = (t: CustomerId) => found.scores[t] ?? 0;

  if (!query) {
    const lp = logSoftmax(types.map((t) => CUE_ONLY_WEIGHT * cue(t)));
    return rank(Object.fromEntries(types.map((t, i) => [t, lp[i]])) as Record<CustomerId, number>, {
      cues: found.hits,
      keywordOnly: true,
      noSignal: found.hits.length === 0,
    });
  }

  const cos = types.map((t) => dot(query, cents.get(t)!));
  const lp = logSoftmax(types.map((t, i) => cos[i] / TEMPERATURE + CUE_WEIGHT * cue(t)));

  // The closest example per type, shown as a tooltip ("Similar to: …").
  const examples: Partial<Record<CustomerId, string>> = {};
  const best: Partial<Record<CustomerId, number>> = {};
  for (const item of index.items) {
    const s = dot(query, item.vector);
    if (s > (best[item.customerId] ?? -Infinity)) {
      best[item.customerId] = s;
      examples[item.customerId] = item.text;
    }
  }

  return rank(Object.fromEntries(types.map((t, i) => [t, lp[i]])) as Record<CustomerId, number>, {
    examples,
    cues: found.hits,
    noSignal: Math.max(...cos) < MIN_SCORE && found.hits.length === 0,
  });
}
