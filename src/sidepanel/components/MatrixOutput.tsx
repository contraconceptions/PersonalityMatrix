import { useEffect, useState } from "react";
import { copyText } from "../../lib/clipboard";
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
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async (phrase: string) => {
    if (await copyText(phrase)) setCopied(phrase);
  };

  return (
    <section className="output" aria-live="polite">
      <div className="output-head">
        <h2>{g.customer.name}</h2>
        <span className={`fit fit-${g.fit}`}>{FIT_LABEL[g.fit]}</span>
      </div>

      <div className="meta">
        <p>{g.customer.channel}</p>
        <p>
          You <strong>{g.agent.defaultEgoState}</strong> → Them <strong>{g.customer.egoState}</strong>
          {g.transaction === "crossed" ? (
            <span className="crossed"> · Crossed, steer toward Adult</span>
          ) : (
            <span className="complementary"> · In sync</span>
          )}
        </p>
      </div>

      <div className="block risk">
        <h3>Risk</h3>
        <p>{g.risk}</p>
      </div>

      <div className="block relate">
        <h3>Relate</h3>
        <p>{g.relateStrategy}</p>
        <ul className="phrases">
          {g.phrasesToUse.map((p) => (
            <li key={p}>
              <button className="phrase" onClick={() => copy(p)} title="Click to copy">
                <span>“{p}”</span>
                <span className="copy-state" aria-live="polite">
                  {copied === p ? "Copied" : "Copy"}
                </span>
              </button>
            </li>
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
        Clear <kbd>Esc</kbd>
      </button>
    </section>
  );
}
