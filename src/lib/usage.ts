import { getJSON, removeKey, setJSON } from "./storage";
import type { AgentId, CustomerId } from "./types";

// Local-only usage log for QA coaching. It records which pairings come up and which phrases
// get copied, never what the customer said. It never leaves the device unless a supervisor
// exports the CSV.

export type SelectSource = "click" | "key" | "suggestion";

export type UsageEvent =
  | { t: string; type: "select"; agentId: AgentId; customerId: CustomerId; source: SelectSource }
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
  const header = ["timestamp", "event", "agent", "customer", "source", "phrase"];
  const rows = events.map((e) =>
    [e.t, e.type, e.agentId, e.customerId, e.type === "select" ? e.source : "", e.type === "copy" ? e.phrase : ""]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\r\n") + "\r\n";
}

export interface UsageSummary {
  selections: number;
  copies: number;
  bySource: Record<SelectSource, number>;
  topPairs: Array<{ agentId: AgentId; customerId: CustomerId; count: number }>;
  topPhrases: Array<{ phrase: string; count: number }>;
}

export function summarize(events: UsageEvent[], top = 5): UsageSummary {
  const pairs = new Map<string, { agentId: AgentId; customerId: CustomerId; count: number }>();
  const phrases = new Map<string, number>();
  const bySource: Record<SelectSource, number> = { click: 0, key: 0, suggestion: 0 };
  let selections = 0;
  let copies = 0;

  for (const e of events) {
    if (e.type === "select") {
      selections++;
      bySource[e.source]++;
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
  };
}
