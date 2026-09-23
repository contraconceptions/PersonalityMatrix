import type { Guidance } from "../../lib/types";

interface Props {
  guidance: Guidance;
  onReset: () => void;
}

export default function MatrixOutput({ guidance: g, onReset }: Props) {
  return (
    <section className="output" aria-live="polite">
      <div className="output-head">
        <h2>{g.customer.name}</h2>
        {!g.authored && <span className="badge">General guidance</span>}
      </div>

      <p className={`transaction ${g.transaction}`}>
        You ({g.agent.defaultEgoState}) → Customer ({g.customer.egoState}):{" "}
        <strong>{g.transaction === "crossed" ? "crossed — steer to Adult" : "complementary"}</strong>
      </p>

      <ul className="cues">
        {g.customer.identifiers.map((cue) => (
          <li key={cue}>{cue}</li>
        ))}
      </ul>

      <div className="block risk">
        <h3>Risk</h3>
        <p>{g.risk}</p>
      </div>

      <div className="block relate">
        <h3>Relate</h3>
        <p>{g.relateStrategy}</p>
        <ul>
          {g.phrasesToUse.map((p) => (
            <li key={p}>“{p}”</li>
          ))}
        </ul>
      </div>

      <div className="block avoid">
        <h3>Avoid</h3>
        <ul>
          {g.phrasesToAvoid.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <details>
          <summary>Always-avoid triggers ({g.triggers.length})</summary>
          <ul className="triggers">
            {g.triggers.map((t) => (
              <li key={t.phrase}>
                <strong>{t.phrase}</strong>
                <span className="muted small">{t.why}</span>
                <span>Instead: “{t.instead}”</span>
              </li>
            ))}
          </ul>
        </details>
      </div>

      <button className="link" onClick={onReset}>
        Clear
      </button>
    </section>
  );
}
