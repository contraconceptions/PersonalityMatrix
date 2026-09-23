import { useEffect, useRef, useState } from "react";
import indexData from "../../data/exampleEmbeddings.json";
import { embed, onStatus, warmUp, type ModelStatus } from "../../lib/embedClient";
import { getCustomer } from "../../lib/matrix";
import { classify, type Classification, type EmbeddingIndex } from "../../lib/similarity";
import type { CustomerId } from "../../lib/types";

const index = indexData as EmbeddingIndex;
const MIN_CHARS = 12;
const DEBOUNCE_MS = 350;

interface Props {
  onSuggest: (id: CustomerId | null) => void;
  onAccept: (id: CustomerId) => void;
}

// Free-text box: the agent types or pastes what the customer said and gets a suggested
// archetype. Runs fully on-device; the text is never stored or sent anywhere.
export default function DescribeCustomer({ onSuggest, onAccept }: Props) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<ModelStatus>("idle");
  const [result, setResult] = useState<Classification | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    warmUp();
    return onStatus(setStatus);
  }, []);

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < MIN_CHARS) {
      setResult(null);
      onSuggest(null);
      return;
    }
    const ticket = ++latest.current;
    const t = setTimeout(async () => {
      const vector = await embed(trimmed);
      if (ticket !== latest.current || !vector) return; // superseded by newer input
      const r = classify(vector, index);
      setResult(r);
      onSuggest(r.confidence === "none" ? null : r.ranked[0].customerId);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // Only re-run on text changes; onSuggest is a state setter from App.
  }, [text]);

  const top = result && result.confidence !== "none" ? result.ranked[0] : null;
  const alt = result?.confidence === "close" ? result.ranked[1] : null;

  const accept = (id: CustomerId) => {
    onAccept(id);
    setText("");
  };

  return (
    <section className="describe" aria-label="Describe the customer">
      <textarea
        rows={2}
        value={text}
        placeholder="Type or paste what the customer said…"
        aria-describedby="describe-status"
        disabled={status === "error"}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && top) {
            e.preventDefault();
            accept(top.customerId);
          } else if (e.key === "Escape") {
            setText("");
          }
        }}
      />
      <p id="describe-status" className="describe-status">
        {status === "error" ? (
          "Suggestions unavailable. Pick the customer type below."
        ) : top ? (
          <>
            Sounds{" "}
            <button className="suggest" onClick={() => accept(top.customerId)} title={`Similar to: “${top.example}”`}>
              {getCustomer(top.customerId)?.name.replace(/^The /, "")}
            </button>
            {alt && (
              <>
                {" "}or{" "}
                <button className="suggest alt" onClick={() => accept(alt.customerId)} title={`Similar to: “${alt.example}”`}>
                  {getCustomer(alt.customerId)?.name.replace(/^The /, "")}
                </button>
              </>
            )}
            <span className="muted"> · Enter to use</span>
          </>
        ) : text.trim().length >= MIN_CHARS && status === "loading" ? (
          "Preparing on-device model…"
        ) : (
          <span className="muted">Stays on this device.</span>
        )}
      </p>
    </section>
  );
}
