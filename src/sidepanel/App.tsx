import { useEffect, useState } from "react";
import { getAgent, resolveGuidance } from "../lib/matrix";
import { loadAgentId, saveAgentId } from "../lib/storage";
import type { AgentId, CustomerId } from "../lib/types";
import AgentSetup from "./components/AgentSetup";
import CustomerQuickId from "./components/CustomerQuickId";
import MatrixOutput from "./components/MatrixOutput";

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [agentId, setAgentId] = useState<AgentId | null>(null);
  const [customerId, setCustomerId] = useState<CustomerId | null>(null);

  useEffect(() => {
    loadAgentId().then((id) => {
      setAgentId(id && getAgent(id) ? id : null);
      setLoaded(true);
    });
  }, []);

  const chooseAgent = (id: AgentId | null) => {
    setAgentId(id);
    setCustomerId(null);
    void saveAgentId(id);
  };

  if (!loaded) return null;
  if (!agentId) return <AgentSetup onSelect={chooseAgent} />;

  const agent = getAgent(agentId)!;
  const guidance = customerId ? resolveGuidance(agentId, customerId) : undefined;

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <span className="eyebrow">You are</span>
          <strong>{agent.name}</strong>
        </div>
        <button className="link" onClick={() => chooseAgent(null)}>
          Change
        </button>
      </header>

      <CustomerQuickId selected={customerId} onSelect={setCustomerId} />

      {guidance ? (
        <MatrixOutput guidance={guidance} onReset={() => setCustomerId(null)} />
      ) : (
        <p className="hint">Pick the customer type you're hearing to get guidance.</p>
      )}
    </main>
  );
}
