// Transactional Analysis ego states.
export type EgoState =
  | "Nurturing Parent"
  | "Critical Parent"
  | "Adult"
  | "Free Child"
  | "Adapted Child";

export type AgentId = "sage" | "caregiver" | "everyman" | "fixer" | "innovator" | "diplomat";
export type CustomerId =
  | "analytical"
  | "distressed"
  | "demanding"
  | "hesitant"
  | "expressive"
  | "cooperative";

export interface AgentProfile {
  id: AgentId;
  name: string;
  alias: string;
  description: string;
  defaultEgoState: EgoState;
  strengths: string;
  risk: string;
}

export interface CustomerProfile {
  id: CustomerId;
  name: string;
  /** Cues the agent listens for in the first 15-30 seconds. */
  identifiers: string[];
  egoState: EgoState;
  pcmType?: string;
  /** Baseline guidance used when no agent-specific matrix node exists. */
  relateStrategy: string;
  phrasesToUse: string[];
  phrasesToAvoid: string[];
}

export interface MatrixNode {
  agentId: AgentId;
  customerId: CustomerId;
  risk: string;
  relateStrategy: string;
  phrasesToUse: string[];
  phrasesToAvoid: string[];
}

export interface TriggerPhrase {
  phrase: string;
  why: string;
  instead: string;
}

export interface Guidance {
  agent: AgentProfile;
  customer: CustomerProfile;
  /** True when a hand-authored matrix node exists for this pair. */
  authored: boolean;
  /** Agent-specific risk; falls back to the agent's general risk. */
  risk: string;
  relateStrategy: string;
  phrasesToUse: string[];
  phrasesToAvoid: string[];
  /** Global always-avoid triggers, each with a replacement. */
  triggers: TriggerPhrase[];
  /** Customer's ego state vs agent default — crossed if they are likely to clash. */
  transaction: "complementary" | "crossed";
}
