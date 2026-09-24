import { rank, type Classification } from "./similarity";
import type { CustomerId } from "./types";

// Evidence from earlier lines in the same call. A customer's style shows across several lines, so each
// committed line keeps voting, with older lines counting less. Only per-type log-probabilities are kept,
// in memory: never the text, never stored.

export type LineEvidence = Record<CustomerId, number>;

export interface CallMemory {
  lines: LineEvidence[];
  /** Time of the last committed line (ms). */
  lastAt: number;
}

/** Weight of the most recent earlier line; each older line is multiplied by this again. */
export const DECAY = 0.6;
/** One very confident line shouldn't outvote everything after it. */
const FLOOR = -6;
export const MAX_LINES = 20;
/** Forget the call after this long without a new line (the agent likely moved on without "New call"). */
export const IDLE_RESET_MS = 15 * 60 * 1000;

export const emptyCall = (): CallMemory => ({ lines: [], lastAt: 0 });

/** Drop the history if the call has gone idle. */
export function current(memory: CallMemory, now = Date.now()): CallMemory {
  return memory.lines.length && now - memory.lastAt > IDLE_RESET_MS ? emptyCall() : memory;
}

/**
 * Add a line's own evidence (not the combined result, which would double-count history). Weak lines
 * count too: summing weak evidence across lines is the point.
 */
export function commit(memory: CallMemory, line: Classification, now = Date.now()): CallMemory {
  if (!line.signal) return current(memory, now);
  const lines = [line.logProbs, ...current(memory, now).lines].slice(0, MAX_LINES);
  return { lines, lastAt: now };
}

/** Evidence a line leaves when the agent picks a type: the pick leads, unless the line already agreed. */
export const CHOICE_PROB = 0.6;

/** Commit a line the agent accepted as `chosen` (which may differ from the line's own top type). */
export function commitChoice(memory: CallMemory, line: Classification, chosen: CustomerId, now = Date.now()): CallMemory {
  if (!line.signal || line.ranked[0]?.customerId === chosen) return commit(memory, line, now);
  const types = Object.keys(line.logProbs) as CustomerId[];
  const rest = Math.log((1 - CHOICE_PROB) / (types.length - 1));
  const logProbs = Object.fromEntries(types.map((t) => [t, t === chosen ? Math.log(CHOICE_PROB) : rest])) as LineEvidence;
  return commit(memory, { ...line, logProbs }, now);
}

/** Combine the latest line with earlier lines: log p = line + Σ DECAY^k × earlier_k, renormalized. */
export function combine(line: Classification, memory: CallMemory, now = Date.now()): Classification & { callLines: number } {
  const history = current(memory, now).lines;
  if (!history.length) return { ...line, callLines: 0 };
  const types = Object.keys(line.logProbs) as CustomerId[];
  const z = types.map((t) =>
    history.reduce(
      (s, h, k) => s + DECAY ** (k + 1) * Math.max(FLOOR, h[t] ?? FLOOR),
      line.signal ? Math.max(FLOOR, line.logProbs[t]) : 0,
    ),
  );
  const m = Math.max(...z);
  const lse = m + Math.log(z.reduce((s, v) => s + Math.exp(v - m), 0));
  const logProbs = Object.fromEntries(types.map((t, i) => [t, z[i] - lse])) as LineEvidence;
  const examples = Object.fromEntries(line.ranked.map((r) => [r.customerId, r.example]));
  const combined = rank(logProbs, { examples, cues: line.cues, keywordOnly: line.keywordOnly });
  return { ...combined, callLines: history.length };
}
