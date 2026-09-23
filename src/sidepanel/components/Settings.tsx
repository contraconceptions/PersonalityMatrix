import { useEffect, useRef, useState } from "react";
import { exportContent, validateContent } from "../../lib/content";
import { downloadText, today } from "../../lib/download";
import { getAgent, getCustomer } from "../../lib/matrix";
import type { AgentId, BrandVoice, CustomerId } from "../../lib/types";
import { clearEvents, loadEvents, summarize, toCsv, type UsageEvent } from "../../lib/usage";
import { useContent } from "../ContentContext";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Props {
  onBack: () => void;
  onStartDemo: () => void;
}

export default function Settings({ onBack, onStartDemo }: Props) {
  return (
    <main className="app settings">
      <div className="settings-head">
        <button className="link" onClick={onBack}>
          ← Back
        </button>
        <h1>Settings</h1>
      </div>

      <section className="panel">
        <h2>Demo</h2>
        <p className="hint">Five short sample calls that show how the panel guides different pairings.</p>
        <button className="primary" onClick={onStartDemo}>
          Start demo
        </button>
      </section>

      <BrandVoiceSection />
      <ContentSection />
      <UsageSection />
    </main>
  );
}

function BrandVoiceSection() {
  const { content, overrides, saveOverrides } = useContent();
  const [draft, setDraft] = useState<BrandVoice>(content.brandVoice);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(content.brandVoice), [content.brandVoice]);

  const setTerm = (i: number, field: "from" | "to", v: string) =>
    setDraft((d) => ({ ...d, terms: d.terms.map((t, j) => (j === i ? { ...t, [field]: v } : t)) }));
  const setTrigger = (i: number, field: "phrase" | "instead", v: string) =>
    setDraft((d) => ({
      ...d,
      extraTriggers: d.extraTriggers.map((t, j) => (j === i ? { ...t, [field]: v } : t)),
    }));

  const save = async () => {
    const clean: BrandVoice = {
      terms: draft.terms.filter((t) => t.from.trim() && t.to.trim()),
      extraTriggers: draft.extraTriggers
        .filter((t) => t.phrase.trim() && t.instead.trim())
        .map((t) => ({ ...t, why: t.why.trim() || "Company guideline." })),
    };
    await saveOverrides({ ...overrides, brandVoice: clean });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <section className="panel">
      <h2>Brand voice</h2>
      <p className="hint">Word swaps apply to all guidance and to copied phrases.</p>

      <div className="rows">
        {draft.terms.map((t, i) => (
          <div className="row" key={i}>
            <input aria-label="Replace" placeholder="customer" value={t.from} onChange={(e) => setTerm(i, "from", e.target.value)} />
            <span className="muted">→</span>
            <input aria-label="With" placeholder="patient" value={t.to} onChange={(e) => setTerm(i, "to", e.target.value)} />
            <button
              className="icon-btn"
              aria-label="Remove word swap"
              onClick={() => setDraft((d) => ({ ...d, terms: d.terms.filter((_, j) => j !== i) }))}
            >
              ×
            </button>
          </div>
        ))}
        <button className="link" onClick={() => setDraft((d) => ({ ...d, terms: [...d.terms, { from: "", to: "" }] }))}>
          + Add word swap
        </button>
      </div>

      <h3 className="sub">Company “never say” phrases</h3>
      <div className="rows">
        {draft.extraTriggers.map((t, i) => (
          <div className="row stacked" key={i}>
            <input aria-label="Never say" placeholder="Never say…" value={t.phrase} onChange={(e) => setTrigger(i, "phrase", e.target.value)} />
            <input aria-label="Say instead" placeholder="Say instead…" value={t.instead} onChange={(e) => setTrigger(i, "instead", e.target.value)} />
            <button
              className="icon-btn"
              aria-label="Remove phrase"
              onClick={() => setDraft((d) => ({ ...d, extraTriggers: d.extraTriggers.filter((_, j) => j !== i) }))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="link"
          onClick={() =>
            setDraft((d) => ({ ...d, extraTriggers: [...d.extraTriggers, { phrase: "", why: "", instead: "" }] }))
          }
        >
          + Add phrase
        </button>
      </div>

      <div className="actions-row">
        <button className="primary" onClick={save}>
          Save brand voice
        </button>
        {saved && <span className="ok">Saved</span>}
      </div>
    </section>
  );
}

function ContentSection() {
  const { content, overrides, saveOverrides } = useContent();
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const custom = overrides && (overrides.interactionMatrix || overrides.customerProfiles || overrides.triggers);

  const onFile = async (file: File) => {
    setErrors([]);
    setMessage(null);
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setErrors(["That file isn't valid JSON."]);
      return;
    }
    const v = validateContent(data);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    await saveOverrides({ ...overrides, ...v.overrides });
    const n = v.overrides.interactionMatrix?.length ?? 0;
    setMessage(`Imported ${file.name}${n ? ` (${plural(n, "pairing", "pairings")})` : ""}.`);
  };

  return (
    <section className="panel">
      <h2>Guidance content</h2>
      <p className="hint">
        {custom ? "Using imported guidance." : "Using the built-in guidance."} Export to edit it, then import the
        file. Sections in the file replace the current ones.
      </p>
      <div className="actions-row">
        <button
          className="secondary"
          onClick={() =>
            downloadText(
              `personality-matrix-content-${today()}.json`,
              JSON.stringify(exportContent(content), null, 2),
              "application/json",
            )
          }
        >
          Export JSON
        </button>
        <button className="secondary" onClick={() => fileRef.current?.click()}>
          Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
      </div>
      {message && <p className="ok">{message}</p>}
      {errors.length > 0 && (
        <div className="errors" role="alert">
          <strong>Couldn't import that file:</strong>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {overrides && (
        <div className="actions-row">
          {confirmReset ? (
            <>
              <span className="muted small">Remove all imported content and brand voice?</span>
              <button
                className="link danger"
                onClick={async () => {
                  await saveOverrides(null);
                  setConfirmReset(false);
                  setMessage("Back to the built-in guidance.");
                }}
              >
                Yes, reset
              </button>
              <button className="link" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="link" onClick={() => setConfirmReset(true)}>
              Reset to built-in guidance
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function UsageSection() {
  const [events, setEvents] = useState<UsageEvent[] | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    loadEvents().then(setEvents);
  }, []);

  if (!events) return null;
  const s = summarize(events, 3);
  const suggestedPct = s.selections ? Math.round((s.bySource.suggestion / s.selections) * 100) : 0;
  const pairLabel = (a: AgentId, c: CustomerId) =>
    `${getAgent(a)?.name.replace(/^The /, "")} × ${getCustomer(c)?.name.replace(/^The /, "")}`;

  return (
    <section className="panel">
      <h2>Usage on this device</h2>
      <p className="hint">Records which customer types come up and which phrases get copied, never what customers said.</p>
      {events.length === 0 ? (
        <p className="muted small">Nothing recorded yet.</p>
      ) : (
        <>
          <p className="stats">
            {plural(s.selections, "customer type picked", "customer types picked")} ·{" "}
            {plural(s.copies, "phrase copied", "phrases copied")}
            {s.selections > 0 && <> · {suggestedPct}% from suggestions</>}
          </p>
          {s.topPairs.length > 0 && (
            <ol className="top-list">
              {s.topPairs.map((p) => (
                <li key={`${p.agentId}:${p.customerId}`}>
                  <span>{pairLabel(p.agentId, p.customerId)}</span>
                  <span className="muted">{p.count}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      <div className="actions-row">
        <button
          className="secondary"
          disabled={events.length === 0}
          onClick={() => downloadText(`personality-matrix-usage-${today()}.csv`, toCsv(events), "text/csv")}
        >
          Export CSV
        </button>
        {events.length > 0 &&
          (confirmClear ? (
            <>
              <button
                className="link danger"
                onClick={async () => {
                  await clearEvents();
                  setEvents([]);
                  setConfirmClear(false);
                }}
              >
                Yes, clear log
              </button>
              <button className="link" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="link" onClick={() => setConfirmClear(true)}>
              Clear log
            </button>
          ))}
      </div>
    </section>
  );
}
