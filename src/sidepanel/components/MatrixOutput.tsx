import type { Fit, Guidance } from "../../lib/types";

interface Props {
  guidance: Guidance;
  onReset: () => void;
}

const FIT_LABEL: Record<Fit, string> = {
  strong: "Natural fit",
  neutral: "Adjust style",
  watch: "Watch closely",
};

export default function MatrixOutput({ guidance: g, onReset }: Props) {
  return (
    <section className="output" aria-live="polite">
      <div className="output-head">
        <h2>{g.customer.name}</h2>
        <span className={`fit fit-${g.fit}`}>{FIT_LABEL[g.fit]}</span>
      </div>

      <p className="meta">
        {g.customer.channel}
        {g.transaction === "crossed" && <> · Steer toward Adult</>}
      </p>

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
      </div>

      <details className="triggers-panel">
        <summary>Phrases to never use</summary>
        <ul className="triggers">
          {g.triggers.map((t) => (
            <li key={t.phrase}>
              <strong>{t.phrase}</strong>
              <span className="muted">{t.why}</span>
              <span>Instead: “{t.instead}”</span>
            </li>
          ))}
        </ul>
      </details>

      <button className="link" onClick={onReset}>
        Clear
      </button>
    </section>
  );
}
