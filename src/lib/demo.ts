import scenarioData from "../data/demoScenarios.json";
import type { AgentId, CustomerId } from "./types";

export interface DemoScenario {
  id: string;
  title: string;
  agentId: AgentId;
  customerLine: string;
  expectedCustomerId: CustomerId;
  coachNote: string;
}

export const scenarios = scenarioData as DemoScenario[];

/** Each scenario has two beats: hear the customer, then see the guidance. */
export type DemoBeat = "listen" | "guide";

export interface DemoState {
  index: number;
  beat: DemoBeat;
}

export function nextDemo(s: DemoState): DemoState | null {
  if (s.beat === "listen") return { index: s.index, beat: "guide" };
  return s.index + 1 < scenarios.length ? { index: s.index + 1, beat: "listen" } : null;
}

export function prevDemo(s: DemoState): DemoState | null {
  if (s.beat === "guide") return { index: s.index, beat: "listen" };
  return s.index > 0 ? { index: s.index - 1, beat: "guide" } : null;
}
