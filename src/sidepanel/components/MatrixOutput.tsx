import { useEffect, useRef, useState } from "react";
import { copyText } from "../../lib/clipboard";
import { applyTerms } from "../../lib/brandVoice";
import type { MoodTrend } from "../../lib/mood";
import type { Fit, Guidance, MoodState } from "../../lib/types";
import { useContent } from "../ContentContext";
import Icon from "./Icon";

interface Props {
  guidance: Guidance;
  onReset: () => void;
  onCopy?: (phrase: string) => void;
  /** The customer's current mood, when it isn't calm: shown first as "Right now". */
  mood?: { state: MoodState | undefined; trend: MoodTrend | null } | null;
}

const FIT_LABEL: Record<Fit, string> = {
  strong: "Natural fit",
  neutral: "Adjust style",
  watch: "Watch closely",
};

export default function MatrixOutput({ guidance: g, onReset, onCopy, mood }: Props) {
  const { content } = useContent();
  const voice = (s: string) => applyTerms(s, content.brandVoice.terms);
  const [copied, setCopied] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  // Bring new guidance into view when it starts low in the panel; leave it alone if it's already visible.
  useEffect(() => {
    const el = ref.current;
    if (!el || el.getBoundingClientRect().top < window.innerHeight * 0.5) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [g.customer.id]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async (phrase: string) => {
    if (await copyText(phrase)) {
      setCopied(phrase);
      onCopy?.(phrase);
    }
  };

  return (
    <section className="output" aria-live="polite" ref={ref}>
      <div className="output-head">
        <h2>{g.customer.name}</h2>
        <span className={`fit fit-${g.fit}`}>{FIT_LABEL[g.fit]}</span>
      </div>

      <div className="meta">
        <p className="channel">{g.customer.channel}</p>
        <p className="transaction">
          <span>
            You <strong>{g.agent.defaultEgoState}</strong> → Them <strong>{g.customer.egoState}</strong>
          </span>
          {g.transaction === "crossed" ? (
            <span className="tx-pill crossed">Crossed · steer toward Adult</span>
          ) : (
            <span className="tx-pill complementary">In sync</span>
          )}
        </p>
      </div>

      {mood?.state && (
        <div className={`block now now-${mood.state.id}`}>
          <h3>
            Right now: {mood.state.name}
            {mood.trend === "rising" && <span className="trend">▲ heating up</span>}
            {mood.trend === "easing" && <span className="trend">▼ calming down</span>}
          </h3>
          <p>{voice(mood.state.tip)}</p>
          <ul className="phrases">
            {mood.state.phrasesToUse.map(voice).map((p) => (
              <li key={p}>
                <button className={`phrase${copied === p ? " copied" : ""}`} onClick={() => copy(p)} title="Click to copy">
                  <span>“{p}”</span>
                  <span className="copy-state" aria-live="polite">
                    <Icon name={copied === p ? "check" : "copy"} size={14} />
                    {copied === p ? "Copied" : "Copy"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="block risk">
        <h3>
          <Icon name="risk" /> Risk
        </h3>
        <p>{g.risk}</p>
      </div>

      <div className="block relate">
        <h3>
          <Icon name="relate" /> Relate
        </h3>
        <p>{g.relateStrategy}</p>
        <ul className="phrases">
          {g.phrasesToUse.map((p) => (
            <li key={p}>
              <button
                className={`phrase${copied === p ? " copied" : ""}`}
                onClick={() => copy(p)}
                title="Click to copy"
              >
                <span>“{p}”</span>
                <span className="copy-state" aria-live="polite">
                  <Icon name={copied === p ? "check" : "copy"} size={14} />
                  {copied === p ? "Copied" : "Copy"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="block avoid">
        <h3>
          <Icon name="avoid" /> Avoid
        </h3>
        <ul className="avoid-list">
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
