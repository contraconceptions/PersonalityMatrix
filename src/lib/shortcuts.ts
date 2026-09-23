import { customers } from "./matrix";
import type { CustomerId } from "./types";

export type ShortcutAction = { type: "select"; customerId: CustomerId } | { type: "clear" } | null;

interface KeyInput {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  /** Tag name of the focused element, e.g. "INPUT". */
  targetTag?: string;
}

/**
 * In-panel shortcuts: 1–6 pick a customer type (in quick-pick order), Esc clears.
 * Ignored while typing in a field or when a modifier key is held.
 */
export function shortcutFor(e: KeyInput): ShortcutAction {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (e.targetTag && ["INPUT", "TEXTAREA", "SELECT"].includes(e.targetTag)) return null;

  if (e.key === "Escape") return { type: "clear" };

  const n = Number(e.key);
  if (Number.isInteger(n) && n >= 1 && n <= customers.length) {
    return { type: "select", customerId: customers[n - 1].id };
  }
  return null;
}
