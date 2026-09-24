import { checkPattern } from "./cues";
import { agents, customers, defaultContent } from "./matrix";
import type {
  BrandVoice,
  Content,
  CueFamily,
  CustomerProfile,
  EgoState,
  Fit,
  MatrixNode,
  TriggerPhrase,
} from "./types";

export const CONTENT_FORMAT = "personality-matrix-content";
export const CONTENT_VERSION = 1;

type EditableCustomerFields = Omit<CustomerProfile, "id" | "pcmType">;
export type CustomerOverride = { id: CustomerProfile["id"] } & Partial<EditableCustomerFields>;

/** What supervisors import/export and what we persist. Every section is optional. */
export interface ContentOverrides {
  customerProfiles?: CustomerOverride[];
  interactionMatrix?: MatrixNode[];
  triggers?: TriggerPhrase[];
  brandVoice?: BrandVoice;
  cues?: CueFamily[];
}

export type ValidationResult =
  | { ok: true; overrides: ContentOverrides }
  | { ok: false; errors: string[] };

const EGO_STATES: EgoState[] = ["Nurturing Parent", "Critical Parent", "Adult", "Free Child", "Adapted Child"];
const FITS: Fit[] = ["strong", "neutral", "watch"];
const AGENT_IDS = agents.map((a) => a.id) as string[];
const CUSTOMER_IDS = customers.map((c) => c.id) as string[];
const MAX_ERRORS = 10;
const MAX_PATTERN = 300;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

/** Merge overrides onto the defaults. Customers and nodes merge by key; triggers replace. */
export function mergeContent(overrides: ContentOverrides | null, base: Content = defaultContent): Content {
  if (!overrides) return base;

  const customerProfiles = base.customerProfiles.map((c) => {
    const o = overrides.customerProfiles?.find((x) => x.id === c.id);
    return o ? { ...c, ...o } : c;
  });

  const key = (n: MatrixNode) => `${n.agentId}:${n.customerId}`;
  const nodes = new Map(base.interactionMatrix.map((n) => [key(n), n]));
  for (const n of overrides.interactionMatrix ?? []) nodes.set(key(n), n);

  return {
    customerProfiles,
    interactionMatrix: [...nodes.values()],
    triggers: overrides.triggers ?? base.triggers,
    brandVoice: overrides.brandVoice ?? base.brandVoice,
    cues: overrides.cues ?? base.cues,
  };
}

/** Full content in the import/export file format, ready to edit and re-import. */
export function exportContent(content: Content): Record<string, unknown> {
  return {
    format: CONTENT_FORMAT,
    version: CONTENT_VERSION,
    exportedAt: new Date().toISOString(),
    brandVoice: content.brandVoice,
    triggers: content.triggers,
    customerProfiles: content.customerProfiles.map(({ pcmType: _p, ...rest }) => rest),
    interactionMatrix: content.interactionMatrix,
    cues: content.cues,
  };
}

function checkTriggers(v: unknown, where: string, errors: string[]): v is TriggerPhrase[] {
  if (!Array.isArray(v)) {
    errors.push(`${where} must be a list.`);
    return false;
  }
  v.forEach((t, i) => {
    if (!isObj(t) || !isStr(t.phrase) || !isStr(t.why) || !isStr(t.instead)) {
      errors.push(`${where}[${i}] needs text for "phrase", "why" and "instead".`);
    }
  });
  return true;
}

/** Validate an imported file (already JSON-parsed). Returns clean overrides or readable errors. */
export function validateContent(data: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(data)) return { ok: false, errors: ["The file must contain a JSON object."] };
  if (data.format !== undefined && data.format !== CONTENT_FORMAT) {
    errors.push(`Unrecognized "format". Expected "${CONTENT_FORMAT}".`);
  }
  if (data.version !== undefined && data.version !== CONTENT_VERSION) {
    errors.push(`Unsupported "version" ${String(data.version)}. Expected ${CONTENT_VERSION}.`);
  }

  const overrides: ContentOverrides = {};

  if (data.customerProfiles !== undefined) {
    if (!Array.isArray(data.customerProfiles)) errors.push(`"customerProfiles" must be a list.`);
    else {
      overrides.customerProfiles = [];
      data.customerProfiles.forEach((c, i) => {
        const at = `customerProfiles[${i}]`;
        if (!isObj(c) || !CUSTOMER_IDS.includes(c.id as string)) {
          errors.push(`${at}: "id" must be one of ${CUSTOMER_IDS.join(", ")}.`);
          return;
        }
        const o: CustomerOverride = { id: c.id as CustomerOverride["id"] };
        for (const f of ["name", "cue", "channel", "relateStrategy"] as const) {
          if (c[f] === undefined) continue;
          if (isStr(c[f])) o[f] = c[f] as string;
          else errors.push(`${at}.${f} must be text.`);
        }
        for (const f of ["identifiers", "phrasesToUse", "phrasesToAvoid"] as const) {
          if (c[f] === undefined) continue;
          if (isStrArr(c[f])) o[f] = c[f] as string[];
          else errors.push(`${at}.${f} must be a list of text.`);
        }
        if (c.egoState !== undefined) {
          if (EGO_STATES.includes(c.egoState as EgoState)) o.egoState = c.egoState as EgoState;
          else errors.push(`${at}.egoState must be one of ${EGO_STATES.join(", ")}.`);
        }
        overrides.customerProfiles!.push(o);
      });
    }
  }

  if (data.interactionMatrix !== undefined) {
    if (!Array.isArray(data.interactionMatrix)) errors.push(`"interactionMatrix" must be a list.`);
    else {
      overrides.interactionMatrix = [];
      data.interactionMatrix.forEach((n, i) => {
        const at = `interactionMatrix[${i}]`;
        if (!isObj(n)) return void errors.push(`${at} must be an object.`);
        const bad: string[] = [];
        if (!AGENT_IDS.includes(n.agentId as string)) bad.push(`"agentId" (one of ${AGENT_IDS.join(", ")})`);
        if (!CUSTOMER_IDS.includes(n.customerId as string)) bad.push(`"customerId" (one of ${CUSTOMER_IDS.join(", ")})`);
        if (!FITS.includes(n.fit as Fit)) bad.push(`"fit" (strong, neutral or watch)`);
        if (!isStr(n.risk)) bad.push(`"risk"`);
        if (!isStr(n.relateStrategy)) bad.push(`"relateStrategy"`);
        if (!isStrArr(n.phrasesToUse) || n.phrasesToUse.length === 0) bad.push(`"phrasesToUse" (list of text)`);
        if (!isStrArr(n.phrasesToAvoid) || n.phrasesToAvoid.length === 0) bad.push(`"phrasesToAvoid" (list of text)`);
        if (bad.length) return void errors.push(`${at} is missing or has invalid ${bad.join(", ")}.`);
        overrides.interactionMatrix!.push({
          agentId: n.agentId as MatrixNode["agentId"],
          customerId: n.customerId as MatrixNode["customerId"],
          fit: n.fit as Fit,
          basis: n.basis === "research" || n.basis === "derived" ? n.basis : "custom",
          risk: n.risk as string,
          relateStrategy: n.relateStrategy as string,
          phrasesToUse: n.phrasesToUse as string[],
          phrasesToAvoid: n.phrasesToAvoid as string[],
        });
      });
    }
  }

  if (data.triggers !== undefined && checkTriggers(data.triggers, `"triggers"`, errors)) {
    overrides.triggers = data.triggers as TriggerPhrase[];
  }

  if (data.brandVoice !== undefined) {
    const bv = data.brandVoice;
    if (!isObj(bv)) errors.push(`"brandVoice" must be an object.`);
    else {
      const terms = bv.terms ?? [];
      const extra = bv.extraTriggers ?? [];
      if (!Array.isArray(terms) || !terms.every((t) => isObj(t) && isStr(t.from) && isStr(t.to))) {
        errors.push(`"brandVoice.terms" must be a list of { "from": "...", "to": "..." }.`);
      } else if (checkTriggers(extra, `"brandVoice.extraTriggers"`, errors)) {
        overrides.brandVoice = {
          terms: terms as BrandVoice["terms"],
          extraTriggers: extra as TriggerPhrase[],
        };
      }
    }
  }

  if (data.cues !== undefined) {
    if (!Array.isArray(data.cues)) errors.push(`"cues" must be a list.`);
    else {
      overrides.cues = [];
      data.cues.forEach((c, i) => {
        const at = `cues[${i}]`;
        if (!isObj(c)) return void errors.push(`${at} must be an object.`);
        const bad: string[] = [];
        if (!CUSTOMER_IDS.includes(c.customerId as string)) bad.push(`"customerId" (one of ${CUSTOMER_IDS.join(", ")})`);
        if (!isStr(c.why)) bad.push(`"why"`);
        if (typeof c.weight !== "number" || !(c.weight > 0 && c.weight <= 3)) bad.push(`"weight" (a number above 0, up to 3)`);
        if (c.negatable !== undefined && typeof c.negatable !== "boolean") bad.push(`"negatable" (true or false)`);
        if (!isStrArr(c.patterns) || c.patterns.length === 0) bad.push(`"patterns" (list of text)`);
        if (bad.length) return void errors.push(`${at} is missing or has invalid ${bad.join(", ")}.`);
        for (const p of c.patterns as string[]) {
          const problem = p.length > MAX_PATTERN ? `is longer than ${MAX_PATTERN} characters` : checkPattern(p);
          if (problem) return void errors.push(`${at}: pattern "${p.slice(0, 40)}" ${problem}.`);
        }
        overrides.cues!.push({
          customerId: c.customerId as CueFamily["customerId"],
          why: c.why as string,
          weight: c.weight as number,
          ...(c.negatable === undefined ? {} : { negatable: c.negatable as boolean }),
          patterns: c.patterns as string[],
        });
      });
    }
  }

  if (errors.length) {
    const shown = errors.slice(0, MAX_ERRORS);
    if (errors.length > MAX_ERRORS) shown.push(`…and ${errors.length - MAX_ERRORS} more.`);
    return { ok: false, errors: shown };
  }
  return { ok: true, overrides };
}
