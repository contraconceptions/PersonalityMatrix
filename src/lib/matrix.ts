import agentData from "../data/agentProfiles.json";
import cueData from "../data/cues.json";
import customerData from "../data/customerProfiles.json";
import matrixData from "../data/interactionMatrix.json";
import phraseData from "../data/phrases.json";
import { applyBrandVoice } from "./brandVoice";
import type {
  AgentId,
  AgentProfile,
  Content,
  CueFamily,
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
export const cues = cueData as CueFamily[];

/** The built-in guidance. Supervisors can override parts of it (see content.ts). */
export const defaultContent: Content = {
  customerProfiles: customers,
  interactionMatrix: matrix,
  triggers,
  brandVoice: { terms: [], extraTriggers: [] },
  cues,
};

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

export function getCustomer(id: CustomerId, content: Content = defaultContent): CustomerProfile | undefined {
  return content.customerProfiles.find((c) => c.id === id);
}

export function getNode(
  agentId: AgentId,
  customerId: CustomerId,
  content: Content = defaultContent,
): MatrixNode | undefined {
  return content.interactionMatrix.find((n) => n.agentId === agentId && n.customerId === customerId);
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
 * Merge guidance for a pair: authored matrix node > customer baseline > global triggers,
 * then apply the brand voice. Always returns something usable, even for unauthored nodes.
 */
export function resolveGuidance(
  agentId: AgentId,
  customerId: CustomerId,
  content: Content = defaultContent,
): Guidance | undefined {
  const agent = getAgent(agentId);
  const customer = getCustomer(customerId, content);
  if (!agent || !customer) return undefined;

  const node = getNode(agentId, customerId, content);

  return applyBrandVoice(
    {
      agent,
      customer,
      authored: Boolean(node),
      fit: node?.fit ?? "neutral",
      risk: node?.risk ?? agent.risk,
      relateStrategy: node?.relateStrategy ?? customer.relateStrategy,
      phrasesToUse: dedupe([...(node?.phrasesToUse ?? []), ...customer.phrasesToUse]),
      phrasesToAvoid: dedupe([...(node?.phrasesToAvoid ?? []), ...customer.phrasesToAvoid]),
      triggers: content.triggers,
      transaction: transactionType(agent.defaultEgoState, customer.egoState),
    },
    content.brandVoice,
  );
}

/** Pairs that still fall back to baseline guidance — the authoring backlog. */
export function missingNodes(content: Content = defaultContent): Array<{ agentId: AgentId; customerId: CustomerId }> {
  return agents.flatMap((a) =>
    content.customerProfiles
      .filter((c) => !getNode(a.id, c.id, content))
      .map((c) => ({ agentId: a.id, customerId: c.id })),
  );
}
