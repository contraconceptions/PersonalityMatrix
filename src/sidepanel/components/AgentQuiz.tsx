import { useState } from "react";
import { questions, scoreQuiz, type QuizResult } from "../../lib/quiz";

interface Props {
  onComplete: (ranked: QuizResult[]) => void;
  onCancel: () => void;
}

// One question per screen; choosing an option advances automatically.
export default function AgentQuiz({ onComplete, onCancel }: Props) {
  const [answers, setAnswers] = useState<number[]>([]);
  const step = answers.length;
  const q = questions[step];

  const choose = (i: number) => {
    const next = [...answers, i];
    if (next.length === questions.length) onComplete(scoreQuiz(next));
    else setAnswers(next);
  };

  return (
    <main className="app">
      <div className="quiz-top">
        <button className="link" onClick={step === 0 ? onCancel : () => setAnswers(answers.slice(0, -1))}>
          ← Back
        </button>
        <span className="muted small">
          {step + 1} of {questions.length}
        </span>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={questions.length}
        aria-valuenow={step}
      >
        <span style={{ width: `${(step / questions.length) * 100}%` }} />
      </div>

      <h1 className="quiz-prompt">{q.prompt}</h1>
      <ul className="card-list" key={q.id}>
        {q.options.map((o, i) => (
          <li key={o.text}>
            <button className="card" onClick={() => choose(i)}>
              {o.text}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
