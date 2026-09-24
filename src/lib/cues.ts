import type { CueFamily, CustomerId } from "./types";

export interface CueHit {
  customerId: CustomerId;
  why: string;
  weight: number;
  /** The words that matched, as typed (lowercased). Shown to the agent, never stored. */
  match: string;
}

export interface CueResult {
  /** Summed family weights per customer type (types with no hits are absent). */
  scores: Partial<Record<CustomerId, number>>;
  hits: CueHit[];
}

// A negation just before a match cancels negatable cues: "I'm not upset", "not in a rush".
const NEGATION = /\b(not|no|never|nor|isn'?t|aren'?t|wasn'?t|weren'?t|don'?t|didn'?t|doesn'?t|won'?t|ain'?t)\s+(\w+\s+)?$/;
const NEGATION_WINDOW = 24;

export function normalize(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

type Compiled = { family: CueFamily; res: RegExp[] };
const cache = new WeakMap<CueFamily[], Compiled[]>();

function compile(families: CueFamily[]): Compiled[] {
  let c = cache.get(families);
  if (!c) {
    c = families.map((family) => ({
      family,
      res: family.patterns.flatMap((p) => {
        try {
          return [new RegExp(p, "g")];
        } catch {
          return []; // Imports are validated; a bad built-in pattern must not break the panel.
        }
      }),
    }));
    cache.set(families, c);
  }
  return c;
}

/** Throws a readable error if a pattern isn't a valid regular expression. */
export function checkPattern(p: string): string | null {
  try {
    new RegExp(p, "g");
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Find the cue families present in a line. Each family counts once. */
export function detectCues(text: string, families: CueFamily[]): CueResult {
  const s = normalize(text);
  const scores: CueResult["scores"] = {};
  const hits: CueHit[] = [];
  for (const { family, res } of compile(families)) {
    let found: string | null = null;
    for (const re of res) {
      re.lastIndex = 0;
      for (let m = re.exec(s); m; m = re.exec(s)) {
        if (m[0] === "") {
          re.lastIndex++;
          continue;
        }
        const before = s.slice(Math.max(0, m.index - NEGATION_WINDOW), m.index);
        if (family.negatable && NEGATION.test(before)) continue;
        found = m[0].trim();
        break;
      }
      if (found) break;
    }
    if (!found) continue;
    scores[family.customerId] = (scores[family.customerId] ?? 0) + family.weight;
    hits.push({ customerId: family.customerId, why: family.why, weight: family.weight, match: found });
  }
  hits.sort((a, b) => b.weight - a.weight);
  return { scores, hits };
}
