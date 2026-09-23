import { customers } from "../../lib/matrix";
import type { CustomerId } from "../../lib/types";

interface Props {
  selected: CustomerId | null;
  onSelect: (id: CustomerId) => void;
}

// Quick-select used in the first 15-30 seconds of a call.
export default function CustomerQuickId({ selected, onSelect }: Props) {
  return (
    <section aria-label="Customer type">
      <h2>Customer sounds…</h2>
      <div className="quick-grid">
        {customers.map((c) => (
          <button
            key={c.id}
            className={`chip${selected === c.id ? " active" : ""}`}
            aria-pressed={selected === c.id}
            title={c.identifiers.join(" · ")}
            onClick={() => onSelect(c.id)}
          >
            {c.name.replace(/^The /, "")}
          </button>
        ))}
      </div>
    </section>
  );
}
