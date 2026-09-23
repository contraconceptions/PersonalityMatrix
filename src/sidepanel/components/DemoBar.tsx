import { getAgent } from "../../lib/matrix";
import { scenarios, type DemoState } from "../../lib/demo";

interface Props {
  demo: DemoState;
  onNext: () => void;
  onPrev: () => void;
  onExit: () => void;
}

// Presenter controls for demo mode. → / ← also step through; Esc exits.
export default function DemoBar({ demo, onNext, onPrev, onExit }: Props) {
  const s = scenarios[demo.index];
  const agent = getAgent(s.agentId)!;
  const isFirst = demo.index === 0 && demo.beat === "listen";
  const isLast = demo.index === scenarios.length - 1 && demo.beat === "guide";

  return (
    <section className="demo-bar" aria-label="Demo">
      <div className="demo-top">
        <span className="demo-tag">
          Demo · {demo.index + 1} of {scenarios.length}
        </span>
        <button className="link" onClick={onExit}>
          Exit demo
        </button>
      </div>
      <strong className="demo-title">{s.title}</strong>
      <p className="demo-step">
        {demo.beat === "listen" ? (
          <>
            {agent.name} takes a call. The customer's opening line is typed in below, and the panel suggests a
            customer type.
          </>
        ) : (
          s.coachNote
        )}
      </p>
      <div className="demo-nav">
        <button className="link" onClick={onPrev} disabled={isFirst}>
          ← Back
        </button>
        <button className="primary small-btn" onClick={isLast ? onExit : onNext}>
          {isLast ? "Finish" : demo.beat === "listen" ? "Show guidance →" : "Next call →"}
        </button>
      </div>
    </section>
  );
}
