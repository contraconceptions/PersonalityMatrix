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
  /** Two-or-three-word cue shown on the quick-pick button. */
  cue: string;
  /** Cues the agent listens for in the first 15-30 seconds. */
  identifiers: string[];
  egoState: EgoState;
  pcmType?: string;
  /** PCM communication channel that best reaches this customer. */
  channel: string;
  /** Baseline guidance used when no agent-specific matrix node exists. */
  relateStrategy: string;
  phrasesToUse: string[];
  phrasesToAvoid: string[];
}

/** How naturally the agent's style suits this customer. */
export type Fit = "strong" | "neutral" | "watch";

export interface MatrixNode {
  agentId: AgentId;
  customerId: CustomerId;
  fit: Fit;
  /** "research" = from the source report; "derived" = extrapolated (see docs/research/matrix-methodology.md). */
  basis: "research" | "derived";
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
  fit: Fit;
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
