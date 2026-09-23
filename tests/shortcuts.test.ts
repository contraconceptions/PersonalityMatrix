import { describe, expect, it } from "vitest";
import { customers } from "../src/lib/matrix";
import { shortcutFor } from "../src/lib/shortcuts";

describe("shortcutFor", () => {
  it("maps 1–6 to customers in quick-pick order", () => {
    customers.forEach((c, i) => {
      expect(shortcutFor({ key: String(i + 1) })).toEqual({ type: "select", customerId: c.id });
    });
  });

  it("maps Escape to clear", () => {
    expect(shortcutFor({ key: "Escape" })).toEqual({ type: "clear" });
  });

  it("ignores other keys, 0 and 7+", () => {
    for (const key of ["0", "7", "a", "Enter", " "]) expect(shortcutFor({ key })).toBeNull();
  });

  it("ignores keys with modifiers or while typing in a field", () => {
    expect(shortcutFor({ key: "1", ctrlKey: true })).toBeNull();
    expect(shortcutFor({ key: "1", metaKey: true })).toBeNull();
    expect(shortcutFor({ key: "1", targetTag: "INPUT" })).toBeNull();
    expect(shortcutFor({ key: "Escape", targetTag: "TEXTAREA" })).toBeNull();
  });
});
