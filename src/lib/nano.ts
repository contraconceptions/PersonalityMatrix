import { normalize } from "./cues";
import type { CustomerId, CustomerProfile } from "./types";

// Optional "deep read" with Chrome's built-in on-device model (Gemini Nano via the Prompt API,
// available to extensions from Chrome 138). Off by default. The model runs on this computer:
// the text never leaves the device and nothing is stored. Chrome downloads the model once, itself.
// Hardware bar (Chrome docs): GPU with more than 4 GB VRAM, or 16 GB RAM and 4 CPU cores; 22 GB free disk.

export type AiStatus = "unsupported" | "unavailable" | "downloadable" | "downloading" | "available";

export interface AiResult {
  customerId: CustomerId;
  runnerUp: CustomerId | null;
  confidence: "low" | "medium" | "high";
  /** Exact phrases from the line that drove the choice (verified to appear in it). */
  evidence: string[];
}

// Minimal typings for the Prompt API (not in lib.dom yet).
interface LmSession {
  prompt(input: string, options?: { responseConstraint?: object; signal?: AbortSignal }): Promise<string>;
  clone(options?: { signal?: AbortSignal }): Promise<LmSession>;
  destroy(): void;
}
interface LmMonitor {
  addEventListener(type: "downloadprogress", listener: (e: { loaded: number }) => void): void;
}
interface LmStatic {
  availability(options?: object): Promise<Exclude<AiStatus, "unsupported">>;
  create(options?: {
    initialPrompts?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    monitor?: (m: LmMonitor) => void;
    signal?: AbortSignal;
  }): Promise<LmSession>;
}

const LANGS = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

const api = (): LmStatic | undefined => (globalThis as { LanguageModel?: LmStatic }).LanguageModel;

export async function aiAvailability(): Promise<AiStatus> {
  const lm = api();
  if (!lm) return "unsupported";
  try {
    return await lm.availability(LANGS);
  } catch {
    return "unavailable";
  }
}

// Research-based language markers per type (docs/research/recognition-analysis.md), given to the model
// alongside each type's identifiers so it judges the same way the rest of the panel does.
const MARKERS: Record<CustomerId, string> = {
  analytical: "asks precise factual questions (which, how much, exactly), numbers, dates, documents; calm",
  distressed: "fear, anxiety, helplessness, self-blame, high personal stakes, pleading or repeated apologies",
  demanding: "blames the company (you always/never), escalation (supervisor, complaint, cancel), judgment words, entitlement or principle, rejects apologies",
  hesitant: "tentative (not sure, maybe), puts off deciding, asks again, fears choosing wrong, asks the agent to choose",
  expressive: "stories and tangents, exclamations, humor, warmth, personal details, rapport questions",
  cooperative: "agrees readily, gives information, has already tried steps, asks what's next, thanks",
};

export function systemPrompt(profiles: CustomerProfile[]): string {
  const types = profiles
    .map((p) => `- ${p.id} (${p.name}): ${p.identifiers.join("; ")}. Language: ${MARKERS[p.id]}.`)
    .join("\n");
  return [
    "You help a contact-center agent recognize the caller's communication style.",
    "You get either something the caller said (it may lack punctuation, from speech-to-text) or the agent's short note about the caller.",
    "Choose the single best-fitting customer type from this list:",
    types,
    "Judge tone and intent, not the topic: a billing question can come from any type.",
    'Watch negation ("I\'m not upset"), and whether absolute words ("always", "never") blame the company (demanding) or the caller themself (distressed).',
    "For evidence, copy up to 3 short exact phrases from the text. Use low confidence when the text gives little to go on.",
  ].join("\n");
}

export function responseSchema(ids: CustomerId[]): object {
  return {
    type: "object",
    properties: {
      customerId: { type: "string", enum: ids },
      runnerUp: { type: "string", enum: [...ids, "none"] },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      evidence: { type: "array", items: { type: "string", maxLength: 60 }, maxItems: 3 },
    },
    required: ["customerId", "runnerUp", "confidence", "evidence"],
    additionalProperties: false,
  };
}

/** Validate the model's JSON. Evidence that doesn't literally appear in the text is dropped. */
export function parseAiResponse(raw: string, text: string, ids: CustomerId[]): AiResult | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (!ids.includes(d.customerId as CustomerId)) return null;
  const customerId = d.customerId as CustomerId;
  const runnerUp = ids.includes(d.runnerUp as CustomerId) && d.runnerUp !== customerId ? (d.runnerUp as CustomerId) : null;
  const confidence = (["low", "medium", "high"] as const).find((c) => c === d.confidence) ?? "low";
  const haystack = normalize(text);
  const evidence = (Array.isArray(d.evidence) ? d.evidence : [])
    .filter((e): e is string => typeof e === "string")
    .map((e) => normalize(e).replace(/^["']|["'.,!?]$/g, ""))
    .filter((e) => e.length >= 2 && e.length <= 60 && haystack.includes(e))
    .slice(0, 3);
  return { customerId, runnerUp, confidence, evidence };
}

// One base session holds the instructions; each line gets a fresh clone so lines don't influence each other.
let base: { prompt: string; session: Promise<LmSession> } | null = null;

function baseSession(profiles: CustomerProfile[], onProgress?: (fraction: number) => void): Promise<LmSession> {
  const lm = api();
  if (!lm) return Promise.reject(new Error("The Prompt API isn't available in this browser."));
  const prompt = systemPrompt(profiles);
  if (base?.prompt !== prompt) {
    const session = lm.create({
      ...LANGS,
      initialPrompts: [{ role: "system", content: prompt }],
      monitor: (m) => m.addEventListener("downloadprogress", (e) => onProgress?.(e.loaded)),
    });
    session.catch(() => {
      if (base?.session === session) base = null;
    });
    base = { prompt, session };
  }
  return base.session;
}

/** Drop the cached session (the setting was turned off, or in tests). */
export function resetAi(): void {
  base?.session.then((s) => s.destroy()).catch(() => {});
  base = null;
}

/** Start (or finish) Chrome's one-time model download. Must be called from a click. */
export async function prepareAi(profiles: CustomerProfile[], onProgress?: (fraction: number) => void): Promise<void> {
  await baseSession(profiles, onProgress);
}

/** Ask the on-device model. Resolves to null if it's unavailable, fails, or returns something invalid. */
export async function aiClassify(text: string, profiles: CustomerProfile[], signal?: AbortSignal): Promise<AiResult | null> {
  const ids = profiles.map((p) => p.id);
  let session: LmSession | null = null;
  try {
    session = await (await baseSession(profiles)).clone({ signal });
    const raw = await session.prompt(`Text: """${text.slice(0, 1000)}"""`, { responseConstraint: responseSchema(ids), signal });
    return parseAiResponse(raw, text, ids);
  } catch {
    return null;
  } finally {
    session?.destroy();
  }
}
