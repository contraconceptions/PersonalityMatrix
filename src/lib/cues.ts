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

/** What any cue family needs for matching (customer-type cues and mood cues share this). */
export interface Matchable {
  why: string;
  weight: number;
  negatable?: boolean;
  patterns: string[];
}

type Compiled<F> = { family: F; res: RegExp[] };
const cache = new WeakMap<object, Compiled<Matchable>[]>();

function compile<F extends Matchable>(families: F[]): Compiled<F>[] {
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
  return c as Compiled<F>[];
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

/** The families present in a line, each with the words that matched. Each family counts once. */
export function matchFamilies<F extends Matchable>(text: string, families: F[]): Array<{ family: F; match: string }> {
  const s = normalize(text);
  const found: Array<{ family: F; match: string }> = [];
  for (const { family, res } of compile(families)) {
    let match: string | null = null;
    for (const re of res) {
      re.lastIndex = 0;
      for (let m = re.exec(s); m; m = re.exec(s)) {
        if (m[0] === "") {
          re.lastIndex++;
          continue;
        }
        const before = s.slice(Math.max(0, m.index - NEGATION_WINDOW), m.index);
        if (family.negatable && NEGATION.test(before)) continue;
        match = m[0].trim();
        break;
      }
      if (match) break;
    }
    if (match) found.push({ family, match });
  }
  return found;
}

/** Find the customer-type cue families present in a line. */
export function detectCues(text: string, families: CueFamily[]): CueResult {
  const scores: CueResult["scores"] = {};
  const hits: CueHit[] = [];
  for (const { family, match } of matchFamilies(text, families)) {
    scores[family.customerId] = (scores[family.customerId] ?? 0) + family.weight;
    hits.push({ customerId: family.customerId, why: family.why, weight: family.weight, match });
  }
  hits.sort((a, b) => b.weight - a.weight);
  return { scores, hits };
}
