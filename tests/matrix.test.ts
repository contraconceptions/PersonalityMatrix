import { describe, expect, it } from "vitest";
import {
  agents,
  customers,
  matrix,
  missingNodes,
  resolveGuidance,
  transactionType,
} from "../src/lib/matrix";

describe("data integrity", () => {
  it("has 6 agent and 6 customer archetypes with unique ids", () => {
    expect(new Set(agents.map((a) => a.id)).size).toBe(6);
    expect(new Set(customers.map((c) => c.id)).size).toBe(6);
  });

  it("matrix nodes reference known archetypes and are not duplicated", () => {
    const agentIds = new Set(agents.map((a) => a.id));
    const customerIds = new Set(customers.map((c) => c.id));
    const keys = matrix.map((n) => `${n.agentId}:${n.customerId}`);
    for (const n of matrix) {
      expect(agentIds.has(n.agentId)).toBe(true);
      expect(customerIds.has(n.customerId)).toBe(true);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every customer baseline has phrases to use and avoid", () => {
    for (const c of customers) {
      expect(c.phrasesToUse.length).toBeGreaterThan(0);
      expect(c.phrasesToAvoid.length).toBeGreaterThan(0);
    }
  });

  it("authored + missing nodes cover all 36 pairs", () => {
    expect(matrix.length + missingNodes().length).toBe(36);
  });
});

describe("resolveGuidance", () => {
  it("uses the authored node when one exists", () => {
    const g = resolveGuidance("sage", "distressed")!;
    expect(g.authored).toBe(true);
    expect(g.relateStrategy).toMatch(/empathy before logic/i);
    expect(g.phrasesToUse[0]).toMatch(/frustrating for you/);
  });

  it("falls back to customer baseline and agent risk otherwise", () => {
    const g = resolveGuidance("sage", "cooperative")!;
    expect(g.authored).toBe(false);
    expect(g.risk).toBe(agents.find((a) => a.id === "sage")!.risk);
    expect(g.relateStrategy).toBe(customers.find((c) => c.id === "cooperative")!.relateStrategy);
  });

  it("de-duplicates phrases merged from node and baseline", () => {
    const g = resolveGuidance("sage", "distressed")!;
    const lower = g.phrasesToAvoid.map((p) => p.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it("always includes global triggers", () => {
    const g = resolveGuidance("fixer", "hesitant")!;
    expect(g.triggers.some((t) => t.phrase.startsWith("Calm down"))).toBe(true);
  });
});

describe("transactionType", () => {
  it("treats Adult↔Adult as complementary", () => {
    expect(transactionType("Adult", "Adult")).toBe("complementary");
  });
  it("treats Adult vs Critical Parent as crossed", () => {
    expect(transactionType("Adult", "Critical Parent")).toBe("crossed");
  });
});
