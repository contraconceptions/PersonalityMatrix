import { matchFamilies } from "./cues";
import type { MoodId, MoodState } from "./types";

// Per-line emotional state (roadmap R2 "state", as opposed to the customer's style). It changes line by
// line, so it's never accumulated: the latest line decides, and the trend compares it with the one before.

export interface Mood {
  id: MoodId | "calm";
  /** Strength of the emotional signal (sum of matched cue weights; 0 = calm). */
  heat: number;
  /** Matched words, strongest first. Shown to the agent, never stored. */
  hits: Array<{ why: string; match: string }>;
}

export type MoodTrend = "rising" | "easing" | "steady";

/** Below this, a state's evidence is too thin to call. */
const MIN_HEAT = 0.9;
/** Heat change between lines that counts as a trend. */
const TREND_STEP = 0.9;
/** ALL-CAPS words typed in notes or chat read as shouting. */
const SHOUTING = /\b[A-Z]{3,}\b/g;
const SHOUT_WEIGHT = 0.8;

export const CALM: Mood = { id: "calm", heat: 0, hits: [] };

export function detectMood(text: string, moods: MoodState[]): Mood {
  const families = moods.flatMap((m) => m.cues.map((c) => ({ ...c, mood: m.id })));
  const score: Partial<Record<MoodId, number>> = {};
  const hits: Array<{ why: string; match: string; weight: number }> = [];
  for (const { family, match } of matchFamilies(text, families)) {
    score[family.mood] = (score[family.mood] ?? 0) + family.weight;
    hits.push({ why: family.why, match, weight: family.weight });
  }
  const shouted = (text.match(SHOUTING) ?? []).filter((w) => !/^(I|OK|ID|PIN|USA|BBB)$/.test(w));
  if (shouted.length >= 2 && moods.some((m) => m.id === "escalating")) {
    score.escalating = (score.escalating ?? 0) + SHOUT_WEIGHT;
    hits.push({ why: "shouting", match: shouted.slice(0, 2).join(" ").toLowerCase(), weight: SHOUT_WEIGHT });
  }

  const heat = Object.values(score).reduce((a, b) => a + b, 0);
  // Escalation outranks frustration: anger plus threats, swearing or escalation demands is escalating.
  const id: Mood["id"] =
    (score.escalating ?? 0) >= MIN_HEAT
      ? "escalating"
      : (score.frustrated ?? 0) >= MIN_HEAT && (score.frustrated ?? 0) >= (score.anxious ?? 0)
        ? "frustrated"
        : (score.anxious ?? 0) >= MIN_HEAT
          ? "anxious"
          : "calm";
  hits.sort((a, b) => b.weight - a.weight);
  return { id, heat, hits: hits.map(({ why, match }) => ({ why, match })) };
}

/** Compare with the previous line of the call. */
export function moodTrend(previousHeat: number | null, heat: number): MoodTrend | null {
  if (previousHeat === null) return null;
  if (heat - previousHeat >= TREND_STEP) return "rising";
  if (previousHeat - heat >= TREND_STEP) return "easing";
  return "steady";
}
