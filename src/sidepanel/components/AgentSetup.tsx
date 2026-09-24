import { useState } from "react";
import { agents, getAgent } from "../../lib/matrix";
import type { QuizResult } from "../../lib/quiz";
import type { AgentId } from "../../lib/types";
import AgentQuiz from "./AgentQuiz";
import { BrandMark } from "./Icon";

type Mode = "intro" | "quiz" | "result" | "pick";

interface Props {
  onSelect: (id: AgentId) => void;
  onStartDemo: () => void;
}

// Onboarding: take the self-assessment quiz, pick a style directly, or watch the demo.
export default function AgentSetup({ onSelect, onStartDemo }: Props) {
  const [mode, setMode] = useState<Mode>("intro");
  const [ranked, setRanked] = useState<QuizResult[]>([]);

  if (mode === "quiz") {
    return (
      <AgentQuiz
        onCancel={() => setMode("intro")}
        onComplete={(r) => {
          setRanked(r);
          setMode("result");
        }}
      />
    );
  }

  if (mode === "result" && ranked.length) {
    const top = getAgent(ranked[0].agentId)!;
    const runnerUp = getAgent(ranked[1].agentId)!;
    return (
      <main className="app">
        <div>
          <span className="eyebrow">Your natural style</span>
          <h1>
            {top.name} <span className="muted">· {top.alias}</span>
          </h1>
        </div>
        <p className="lead">{top.description}</p>
        <div className="block relate">
          <h3>Strength</h3>
          <p>{top.strengths}</p>
        </div>
        <div className="block risk">
          <h3>Watch for</h3>
          <p>{top.risk}</p>
        </div>
        <p className="hint">
          You also lean toward <strong>{runnerUp.name}</strong>.
        </p>
        <div className="actions">
          <button className="primary" onClick={() => onSelect(top.id)}>
            Use {top.name}
          </button>
          <button className="link" onClick={() => setMode("pick")}>
            Choose a different style
          </button>
          <button className="link" onClick={() => setMode("quiz")}>
            Retake quiz
          </button>
        </div>
      </main>
    );
  }

  if (mode === "pick") {
    return (
      <main className="app">
        <button className="link" onClick={() => setMode("intro")}>
          ← Back
        </button>
        <h1>Choose your style</h1>
        <ul className="card-list">
          {agents.map((a) => (
            <li key={a.id}>
              <button className="card" onClick={() => onSelect(a.id)}>
                <strong>
                  {a.name} <span className="muted">· {a.alias}</span>
                </strong>
                <span>{a.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <main className="app intro">
      <div className="brand">
        <BrandMark />
        <span>PersonalityMatrix</span>
      </div>
      <h1>Find your communication style</h1>
      <p className="lead">
        Ten quick questions about how you handle calls. There are no right answers. Pick what
        you'd actually do, not what you think you should do.
      </p>
      <div className="actions">
        <button className="primary" onClick={() => setMode("quiz")}>
          Start the quiz · about 2 minutes
        </button>
        <button className="link" onClick={() => setMode("pick")}>
          I already know my style
        </button>
        <button className="link" onClick={onStartDemo}>
          Watch a demo
        </button>
      </div>
      <p className="privacy-note">Runs entirely on this device. What customers say is never stored or sent anywhere.</p>
    </main>
  );
}
