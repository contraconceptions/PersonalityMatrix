import type { BrandVoice, Guidance } from "./types";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match the replacement's case to the original word: "Customer" → "Patient", "CUSTOMER" → "PATIENT". */
function matchCase(original: string, replacement: string): string {
  if (original === original.toUpperCase() && original !== original.toLowerCase()) {
    return replacement.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Whole-word, case-insensitive term swaps. Plurals are handled when the term is a simple
 * word ("customers" → "patients"). Longer terms are applied first so phrases win over words.
 */
export function applyTerms(text: string, terms: BrandVoice["terms"]): string {
  const active = terms
    .filter((t) => t.from.trim() && t.to.trim())
    .sort((a, b) => b.from.length - a.from.length);
  let out = text;
  for (const { from, to } of active) {
    const re = new RegExp(`\\b(${escapeRegExp(from.trim())})(s?)\\b`, "gi");
    out = out.replace(re, (_m, word: string, plural: string) => matchCase(word, to.trim()) + plural);
  }
  return out;
}

/** Apply the brand voice to a resolved guidance card. */
export function applyBrandVoice(g: Guidance, voice: BrandVoice): Guidance {
  const t = (s: string) => applyTerms(s, voice.terms);
  return {
    ...g,
    risk: t(g.risk),
    relateStrategy: t(g.relateStrategy),
    phrasesToUse: g.phrasesToUse.map(t),
    phrasesToAvoid: g.phrasesToAvoid.map(t),
    triggers: [...voice.extraTriggers, ...g.triggers].map((tr) => ({
      phrase: t(tr.phrase),
      why: t(tr.why),
      instead: t(tr.instead),
    })),
    customer: {
      ...g.customer,
      channel: t(g.customer.channel),
      identifiers: g.customer.identifiers.map(t),
    },
  };
}
