import { getJSON, removeKey, setJSON } from "./storage";
import type { AgentId, CustomerId } from "./types";

// Local-only usage log for QA coaching. It records which pairings come up and which phrases
// get copied, never what the customer said. It never leaves the device unless a supervisor
// exports the CSV.

export type SelectSource = "click" | "key" | "suggestion";

/** What the panel was suggesting when the agent picked a type (roadmap R1). Type ids only, never text. */
export interface SuggestionAtPick {
  suggested: CustomerId;
  confidence: "clear" | "close" | "none";
  /** Which recognizer produced it. */
  by: "model" | "keywords" | "ai";
}

export type UsageEvent =
  | ({ t: string; type: "select"; agentId: AgentId; customerId: CustomerId; source: SelectSource } & Partial<SuggestionAtPick>)
  | { t: string; type: "copy"; agentId: AgentId; customerId: CustomerId; phrase: string };

type NewEvent =
  | Omit<Extract<UsageEvent, { type: "select" }>, "t">
  | Omit<Extract<UsageEvent, { type: "copy" }>, "t">;

const KEY = "usageLog";
export const MAX_EVENTS = 5000;

// Serialize writes so rapid events don't overwrite each other.
let queue: Promise<void> = Promise.resolve();

export function logEvent(event: NewEvent): Promise<void> {
  queue = queue.then(async () => {
    const log = (await getJSON<UsageEvent[]>(KEY)) ?? [];
    log.push({ ...event, t: new Date().toISOString() } as UsageEvent);
    await setJSON(KEY, log.length > MAX_EVENTS ? log.slice(-MAX_EVENTS) : log);
  });
  return queue;
}

export async function loadEvents(): Promise<UsageEvent[]> {
  await queue;
  return (await getJSON<UsageEvent[]>(KEY)) ?? [];
}

export async function clearEvents(): Promise<void> {
  await queue;
  await removeKey(KEY);
}

function csvCell(v: string): string {
  // Quote when needed; neutralize spreadsheet formula injection from copied phrases.
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(events: UsageEvent[]): string {
  const header = ["timestamp", "event", "agent", "customer", "source", "phrase", "suggested", "suggestion_confidence", "suggested_by", "agreed"];
  const rows = events.map((e) => {
    const s = e.type === "select" && e.suggested ? e : null;
    return [
      e.t,
      e.type,
      e.agentId,
      e.customerId,
      e.type === "select" ? e.source : "",
      e.type === "copy" ? e.phrase : "",
      s?.suggested ?? "",
      s?.confidence ?? "",
      s?.by ?? "",
      s ? (s.suggested === s.customerId ? "yes" : "no") : "",
    ]
      .map(csvCell)
      .join(",");
  });
  return [header.join(","), ...rows].join("\r\n") + "\r\n";
}

export interface UsageSummary {
  selections: number;
  copies: number;
  bySource: Record<SelectSource, number>;
  topPairs: Array<{ agentId: AgentId; customerId: CustomerId; count: number }>;
  topPhrases: Array<{ phrase: string; count: number }>;
  /** Picks made while a suggestion was showing, and how often the agent went with it. */
  suggestions: {
    shown: number;
    agreed: number;
    byConfidence: Record<SuggestionAtPick["confidence"], { shown: number; agreed: number }>;
    /** Most frequent overrides: suggested → what the agent picked instead. */
    topOverrides: Array<{ suggested: CustomerId; chosen: CustomerId; count: number }>;
  };
}

export function summarize(events: UsageEvent[], top = 5): UsageSummary {
  const pairs = new Map<string, { agentId: AgentId; customerId: CustomerId; count: number }>();
  const phrases = new Map<string, number>();
  const bySource: Record<SelectSource, number> = { click: 0, key: 0, suggestion: 0 };
  let selections = 0;
  let copies = 0;
  const sugg: UsageSummary["suggestions"] = {
    shown: 0,
    agreed: 0,
    byConfidence: { clear: { shown: 0, agreed: 0 }, close: { shown: 0, agreed: 0 }, none: { shown: 0, agreed: 0 } },
    topOverrides: [],
  };
  const overrides = new Map<string, { suggested: CustomerId; chosen: CustomerId; count: number }>();

  for (const e of events) {
    if (e.type === "select") {
      selections++;
      bySource[e.source]++;
      if (e.suggested) {
        const ok = e.suggested === e.customerId;
        sugg.shown++;
        if (ok) sugg.agreed++;
        const c = sugg.byConfidence[e.confidence ?? "none"];
        c.shown++;
        if (ok) c.agreed++;
        else {
          const ko = `${e.suggested}>${e.customerId}`;
          const o = overrides.get(ko) ?? { suggested: e.suggested, chosen: e.customerId, count: 0 };
          o.count++;
          overrides.set(ko, o);
        }
      }
      const k = `${e.agentId}:${e.customerId}`;
      const p = pairs.get(k) ?? { agentId: e.agentId, customerId: e.customerId, count: 0 };
      p.count++;
      pairs.set(k, p);
    } else {
      copies++;
      phrases.set(e.phrase, (phrases.get(e.phrase) ?? 0) + 1);
    }
  }

  return {
    selections,
    copies,
    bySource,
    topPairs: [...pairs.values()].sort((a, b) => b.count - a.count).slice(0, top),
    topPhrases: [...phrases]
      .map(([phrase, count]) => ({ phrase, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, top),
    suggestions: { ...sugg, topOverrides: [...overrides.values()].sort((a, b) => b.count - a.count).slice(0, top) },
  };
}
