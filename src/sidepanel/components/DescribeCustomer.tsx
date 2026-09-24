import { useEffect, useRef, useState } from "react";
import indexData from "../../data/exampleEmbeddings.json";
import { embed, onStatus, warmUp, type ModelStatus } from "../../lib/embedClient";
import { getCustomer } from "../../lib/matrix";
import { classify, type Classification, type EmbeddingIndex } from "../../lib/similarity";
import type { CustomerId } from "../../lib/types";
import { useContent } from "../ContentContext";

const index = indexData as EmbeddingIndex;
const MIN_CHARS = 12;
const DEBOUNCE_MS = 350;

/** Resolves to null if the model failed to load. */
async function classifyText(text: string): Promise<Classification | null> {
  const vector = await embed(text);
  return vector ? classify(vector, index) : null;
}

interface Props {
  onSuggest: (id: CustomerId | null) => void;
  onAccept: (id: CustomerId) => void;
  /** Demo mode: type this text into the box, as if the agent were typing it live. */
  presetText?: string;
}

// Free-text box: the agent types or pastes what the customer said and gets a suggested
// archetype. Runs fully on-device; the text is never stored or sent anywhere.
export default function DescribeCustomer({ onSuggest, onAccept, presetText }: Props) {
  const { content } = useContent();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<ModelStatus>("idle");
  const [result, setResult] = useState<Classification | null>(null);
  const latest = useRef(0);
  // The trimmed text `result` was computed for. While the agent is still typing (or just pasted),
  // the shown suggestion is for older text and Enter must not accept it.
  const resultText = useRef("");

  useEffect(() => {
    warmUp();
    return onStatus(setStatus);
  }, []);

  useEffect(() => {
    if (presetText === undefined) return;
    setText("");
    // Progress by elapsed time, not tick count, so it finishes on time even if timers are throttled.
    const start = performance.now();
    const TYPE_MS = 1500;
    const id = setInterval(() => {
      const n = Math.ceil(((performance.now() - start) / TYPE_MS) * presetText.length);
      setText(presetText.slice(0, n));
      if (n >= presetText.length) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, [presetText]);

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < MIN_CHARS) {
      setResult(null);
      onSuggest(null);
      return;
    }
    const ticket = ++latest.current;
    const t = setTimeout(async () => {
      const r = await classifyText(trimmed);
      if (ticket !== latest.current || !r) return; // superseded by newer input
      show(r, trimmed);
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

  function show(r: Classification, forText: string) {
    setResult(r);
    resultText.current = forText;
    onSuggest(r.confidence === "none" ? null : r.ranked[0].customerId);
  }

  // Enter before the debounced suggestion has caught up: classify the current text now, then accept.
  const acceptCurrent = async (trimmed: string) => {
    const ticket = ++latest.current; // also cancels the pending debounced run
    const r = await classifyText(trimmed);
    if (ticket !== latest.current || !r) return; // text changed meanwhile, or the model failed
    if (r.confidence === "none") show(r, trimmed);
    else accept(r.ranked[0].customerId);
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
          const trimmed = text.trim();
          if (e.key === "Enter" && !e.shiftKey && top && resultText.current === trimmed) {
            e.preventDefault();
            accept(top.customerId);
          } else if (e.key === "Enter" && !e.shiftKey && trimmed.length >= MIN_CHARS && status !== "error") {
            e.preventDefault();
            void acceptCurrent(trimmed);
          } else if (e.key === "Escape") {
            setText("");
          }
        }}
      />
      <p id="describe-status" className={`describe-status is-${status}`}>
        {status === "error" ? (
          "Suggestions unavailable. Pick the customer type below."
        ) : top ? (
          <>
            Sounds{" "}
            <button className="suggest" onClick={() => accept(top.customerId)} title={`Similar to: “${top.example}”`}>
              {getCustomer(top.customerId, content)?.name.replace(/^The /, "")}
            </button>
            {alt && (
              <>
                {" "}or{" "}
                <button className="suggest alt" onClick={() => accept(alt.customerId)} title={`Similar to: “${alt.example}”`}>
                  {getCustomer(alt.customerId, content)?.name.replace(/^The /, "")}
                </button>
              </>
            )}
            <span className="muted enter-hint">
              <kbd>Enter</kbd> to use
            </span>
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
