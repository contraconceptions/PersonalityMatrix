import { MODEL_ID, type EmbeddingIndex } from "./similarity";
import type { CustomerId } from "./types";

// Client example lines: real, anonymized customer lines a supervisor imports (content import section
// "customerExamples"). They're embedded on this device with the same model as the built-in examples and
// stored locally, so recognition learns the client's language without a rebuild.

export type ExampleLines = Partial<Record<CustomerId, string[]>>;

export interface ClientExamples {
  /** "add" to the built-in examples (default) or "replace" them. */
  mode: "add" | "replace";
  lines: ExampleLines;
}

/** Embedded client examples, as stored under STORAGE_KEY. */
export interface ClientIndex extends EmbeddingIndex {
  mode: ClientExamples["mode"];
  /** Hash of the lines, to tell whether the stored vectors match the imported text. */
  hash: string;
}

export const STORAGE_KEY = "clientIndex";
export const MAX_LINES = 1500;
const MAX_LINE_LENGTH = 500;
/** "replace" must still teach every type. */
const MIN_PER_TYPE_WHEN_REPLACING = 3;

// Obvious personal data. Supervisors must anonymize before importing (NEXT-STEPS §4); this catches slips.
const PII: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.]+/, "an email address"],
  [/\d(?:[ -]?\d){8,}/, "a long number (account, card or phone)"],
];

export function countLines(lines: ExampleLines): number {
  return Object.values(lines).reduce((n, l) => n + (l?.length ?? 0), 0);
}

/** Validate the import section. `ids` are the known customer types. */
export function validateExamples(data: unknown, mode: unknown, ids: CustomerId[], errors: string[]): ClientExamples | null {
  const start = errors.length;
  if (mode !== undefined && mode !== "add" && mode !== "replace") errors.push(`"customerExamplesMode" must be "add" or "replace".`);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    errors.push(`"customerExamples" must be an object like { "analytical": ["…"], "distressed": ["…"] }.`);
    return null;
  }
  const lines: ExampleLines = {};
  for (const [type, list] of Object.entries(data)) {
    if (!ids.includes(type as CustomerId)) {
      errors.push(`"customerExamples.${type}": not a customer type (use ${ids.join(", ")}).`);
      continue;
    }
    if (!Array.isArray(list) || !list.every((l) => typeof l === "string" && l.trim())) {
      errors.push(`"customerExamples.${type}" must be a list of text.`);
      continue;
    }
    const clean = [...new Set(list.map((l: string) => l.trim()))];
    clean.forEach((l, i) => {
      if (l.length > MAX_LINE_LENGTH) errors.push(`"customerExamples.${type}[${i}]" is longer than ${MAX_LINE_LENGTH} characters.`);
      for (const [re, what] of PII) if (re.test(l)) errors.push(`"customerExamples.${type}[${i}]" looks like it contains ${what}. Anonymize it first.`);
    });
    lines[type as CustomerId] = clean;
  }
  const total = countLines(lines);
  if (total === 0) errors.push(`"customerExamples" has no lines.`);
  if (total > MAX_LINES) errors.push(`"customerExamples" has ${total} lines; the limit is ${MAX_LINES}.`);
  const m = mode === "replace" ? "replace" : "add";
  if (m === "replace") {
    const thin = ids.filter((id) => (lines[id]?.length ?? 0) < MIN_PER_TYPE_WHEN_REPLACING);
    if (thin.length) errors.push(`With "replace", every type needs at least ${MIN_PER_TYPE_WHEN_REPLACING} lines (short: ${thin.join(", ")}).`);
  }
  return errors.length > start ? null : { mode: m, lines };
}

/** Stable, order-independent hash of the example lines (FNV-1a). */
export function hashExamples(ex: ClientExamples): string {
  const s =
    ex.mode +
    Object.entries(ex.lines)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([t, l]) => `${t}:${[...(l ?? [])].sort().join("\u0001")}`)
      .join("\u0002");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
}

/** Embed every line. Throws if the model isn't available, so nothing half-built gets saved. */
export async function buildClientIndex(
  ex: ClientExamples,
  embed: (text: string) => Promise<number[] | null>,
  onProgress?: (done: number, total: number) => void,
): Promise<ClientIndex> {
  const all = Object.entries(ex.lines).flatMap(([t, l]) => (l ?? []).map((text) => ({ customerId: t as CustomerId, text })));
  const items: ClientIndex["items"] = [];
  for (const [i, { customerId, text }] of all.entries()) {
    const v = await embed(text);
    if (!v) throw new Error("The on-device model isn't available, so the example lines couldn't be learned. Try again once suggestions work.");
    items.push({ customerId, text, vector: v.map((x) => Math.round(x * 1e5) / 1e5) });
    onProgress?.(i + 1, all.length);
  }
  return { model: MODEL_ID, dims: items[0]?.vector.length ?? 0, items, mode: ex.mode, hash: hashExamples(ex) };
}

/** The index recognition uses: built-in examples plus (or replaced by) the client's. */
export function mergeIndex(builtIn: EmbeddingIndex, client: ClientIndex | null): EmbeddingIndex {
  if (!client || client.model !== builtIn.model || client.dims !== builtIn.dims || !client.items.length) return builtIn;
  return { model: builtIn.model, dims: builtIn.dims, items: client.mode === "replace" ? client.items : [...builtIn.items, ...client.items] };
}
