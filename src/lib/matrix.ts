import agentData from "../data/agentProfiles.json";
import customerData from "../data/customerProfiles.json";
import matrixData from "../data/interactionMatrix.json";
import phraseData from "../data/phrases.json";
import type {
  AgentId,
  AgentProfile,
  CustomerId,
  CustomerProfile,
  EgoState,
  Guidance,
  MatrixNode,
  TriggerPhrase,
} from "./types";

export const agents = agentData as AgentProfile[];
export const customers = customerData as CustomerProfile[];
export const matrix = matrixData as MatrixNode[];
export const triggers = phraseData as TriggerPhrase[];

// Ego-state pairs where a stimulus from one side naturally gets the expected
// response from the other (TA "complementary transaction"). Anything else is
// treated as crossed — the agent should consciously steer toward Adult.
const COMPLEMENTARY: ReadonlyArray<[EgoState, EgoState]> = [
  ["Adult", "Adult"],
  ["Nurturing Parent", "Adapted Child"],
  ["Free Child", "Free Child"],
];

export function transactionType(agent: EgoState, customer: EgoState): Guidance["transaction"] {
  return COMPLEMENTARY.some(([a, c]) => a === agent && c === customer)
    ? "complementary"
    : "crossed";
}

export function getAgent(id: AgentId): AgentProfile | undefined {
  return agents.find((a) => a.id === id);
}

export function getCustomer(id: CustomerId): CustomerProfile | undefined {
  return customers.find((c) => c.id === id);
}

export function getNode(agentId: AgentId, customerId: CustomerId): MatrixNode | undefined {
  return matrix.find((n) => n.agentId === agentId && n.customerId === customerId);
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((s) => {
    const key = s.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Merge guidance for a pair: authored matrix node > customer baseline > global triggers.
 * Always returns something usable, even for nodes that haven't been authored yet.
 */
export function resolveGuidance(agentId: AgentId, customerId: CustomerId): Guidance | undefined {
  const agent = getAgent(agentId);
  const customer = getCustomer(customerId);
  if (!agent || !customer) return undefined;

  const node = getNode(agentId, customerId);

  return {
    agent,
    customer,
    authored: Boolean(node),
    fit: node?.fit ?? "neutral",
    risk: node?.risk ?? agent.risk,
    relateStrategy: node?.relateStrategy ?? customer.relateStrategy,
    phrasesToUse: dedupe([...(node?.phrasesToUse ?? []), ...customer.phrasesToUse]),
    phrasesToAvoid: dedupe([...(node?.phrasesToAvoid ?? []), ...customer.phrasesToAvoid]),
    triggers,
    transaction: transactionType(agent.defaultEgoState, customer.egoState),
  };
}

/** Pairs that still fall back to baseline guidance — the authoring backlog. */
export function missingNodes(): Array<{ agentId: AgentId; customerId: CustomerId }> {
  return agents.flatMap((a) =>
    customers
      .filter((c) => !getNode(a.id, c.id))
      .map((c) => ({ agentId: a.id, customerId: c.id })),
  );
}
