import { useEffect, useState } from "react";
import { nextDemo, prevDemo, scenarios, type DemoState } from "../lib/demo";
import { getAgent, resolveGuidance } from "../lib/matrix";
import { shortcutFor } from "../lib/shortcuts";
import { loadAgentId, saveAgentId } from "../lib/storage";
import type { AgentId, CustomerId } from "../lib/types";
import { logEvent, type SelectSource } from "../lib/usage";
import AgentSetup from "./components/AgentSetup";
import CustomerQuickId from "./components/CustomerQuickId";
import DemoBar from "./components/DemoBar";
import DescribeCustomer from "./components/DescribeCustomer";
import MatrixOutput from "./components/MatrixOutput";
import Settings from "./components/Settings";
import { useContent } from "./ContentContext";

export default function App() {
  const { content } = useContent();
  const [loaded, setLoaded] = useState(false);
  const [agentId, setAgentId] = useState<AgentId | null>(null);
  const [customerId, setCustomerId] = useState<CustomerId | null>(null);
  const [suggestedId, setSuggestedId] = useState<CustomerId | null>(null);
  const [view, setView] = useState<"main" | "settings">("main");
  const [demo, setDemo] = useState<DemoState | null>(null);

  const scenario = demo ? scenarios[demo.index] : null;
  // In a demo the scenario's agent is used for display only; the saved agent is untouched.
  const activeAgentId = scenario?.agentId ?? agentId;

  useEffect(() => {
    loadAgentId().then((id) => {
      setAgentId(id && getAgent(id) ? id : null);
      setLoaded(true);
    });
  }, []);

  // Each demo beat sets the customer: none while listening, the scenario's type for guidance.
  useEffect(() => {
    if (scenario && demo) setCustomerId(demo.beat === "guide" ? scenario.expectedCustomerId : null);
  }, [demo, scenario]);

  const selectCustomer = (id: CustomerId | null, source: SelectSource) => {
    setCustomerId(id);
    if (id && activeAgentId && !demo) void logEvent({ type: "select", agentId: activeAgentId, customerId: id, source });
  };

  const stepDemo = (dir: 1 | -1) =>
    setDemo((d) => (d ? (dir === 1 ? nextDemo(d) : prevDemo(d)) ?? (dir === 1 ? null : d) : d));

  const startDemo = () => {
    setView("main");
    setDemo({ index: 0, beat: "listen" });
  };

  const exitDemo = () => {
    setDemo(null);
    setCustomerId(null);
  };

  useEffect(() => {
    if (!activeAgentId || view !== "main") return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (demo && !["INPUT", "TEXTAREA"].includes(tag ?? "")) {
        if (e.key === "ArrowRight") return void (e.preventDefault(), stepDemo(1));
        if (e.key === "ArrowLeft") return void (e.preventDefault(), stepDemo(-1));
        if (e.key === "Escape") return void (e.preventDefault(), exitDemo());
      }
      const action = shortcutFor({ key: e.key, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, targetTag: tag });
      if (!action) return;
      e.preventDefault();
      selectCustomer(action.type === "select" ? action.customerId : null, "key");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const chooseAgent = (id: AgentId | null) => {
    setAgentId(id);
    setCustomerId(null);
    void saveAgentId(id);
  };

  if (!loaded) return null;
  if (view === "settings") return <Settings onBack={() => setView("main")} onStartDemo={startDemo} />;
  if (!activeAgentId) return <AgentSetup onSelect={chooseAgent} onStartDemo={startDemo} />;

  const agent = getAgent(activeAgentId)!;
  const guidance = customerId ? resolveGuidance(activeAgentId, customerId, content) : undefined;

  return (
    <main className="app">
      {demo ? (
        <DemoBar demo={demo} onNext={() => stepDemo(1)} onPrev={() => stepDemo(-1)} onExit={exitDemo} />
      ) : null}

      <header className="app-header">
        <div>
          <span className="eyebrow">You are</span>
          <strong>{agent.name}</strong>
        </div>
        {!demo && (
          <nav className="header-links">
            <button className="link" onClick={() => chooseAgent(null)}>
              Change
            </button>
            <button className="link" onClick={() => setView("settings")}>
              Settings
            </button>
          </nav>
        )}
      </header>

      <DescribeCustomer
        key={demo ? `demo-${demo.index}` : "live"}
        presetText={scenario?.customerLine}
        onSuggest={setSuggestedId}
        onAccept={(id) => (demo ? setDemo({ index: demo.index, beat: "guide" }) : selectCustomer(id, "suggestion"))}
      />

      <CustomerQuickId selected={customerId} suggested={suggestedId} onSelect={(id) => selectCustomer(id, "click")} />

      {guidance ? (
        <MatrixOutput
          guidance={guidance}
          onReset={() => setCustomerId(null)}
          onCopy={(phrase) =>
            !demo && customerId && void logEvent({ type: "copy", agentId: activeAgentId, customerId, phrase })
          }
        />
      ) : (
        <p className="hint">
          Pick the customer type you're hearing, or press <kbd>1</kbd>–<kbd>6</kbd>.
        </p>
      )}
    </main>
  );
}
