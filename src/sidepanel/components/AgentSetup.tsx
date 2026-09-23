import { agents } from "../../lib/matrix";
import type { AgentId } from "../../lib/types";

// One-time onboarding. Phase 1 adds a short diagnostic quiz that recommends
// an archetype; for now the agent self-selects.
export default function AgentSetup({ onSelect }: { onSelect: (id: AgentId) => void }) {
  return (
    <main className="app">
      <h1>What's your natural style?</h1>
      <p className="hint">Pick the description that sounds most like you on a tough call.</p>
      <ul className="card-list">
        {agents.map((a) => (
          <li key={a.id}>
            <button className="card" onClick={() => onSelect(a.id)}>
              <strong>
                {a.name} <span className="muted">· {a.alias}</span>
              </strong>
              <span>{a.description}</span>
              <span className="muted small">Strength: {a.strengths}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
