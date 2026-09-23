import { customers } from "../../lib/matrix";
import type { CustomerId } from "../../lib/types";

interface Props {
  selected: CustomerId | null;
  /** Archetype suggested from the free-text box, outlined until picked. */
  suggested?: CustomerId | null;
  onSelect: (id: CustomerId) => void;
}

// Quick-select used in the first 15-30 seconds of a call. Keys 1–6 match button order.
export default function CustomerQuickId({ selected, suggested, onSelect }: Props) {
  return (
    <section aria-label="Customer type">
      <h2>Customer sounds…</h2>
      <div className="quick-grid">
        {customers.map((c, i) => (
          <button
            key={c.id}
            className={`chip${selected === c.id ? " active" : ""}${suggested === c.id && selected !== c.id ? " suggested" : ""}`}
            aria-pressed={selected === c.id}
            aria-keyshortcuts={String(i + 1)}
            title={c.identifiers.join(" · ")}
            onClick={() => onSelect(c.id)}
          >
            <span className="chip-key" aria-hidden="true">
              {i + 1}
            </span>
            <span className="chip-name">{c.name.replace(/^The /, "")}</span>
            <span className="chip-cue">{c.cue}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
