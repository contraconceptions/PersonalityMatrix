import { describe, expect, it } from "vitest";
import { applyTerms } from "../src/lib/brandVoice";
import { exportContent, mergeContent, validateContent } from "../src/lib/content";
import { nextDemo, prevDemo, scenarios } from "../src/lib/demo";
import { agents, customers, defaultContent, resolveGuidance } from "../src/lib/matrix";
import { summarize, toCsv, type UsageEvent } from "../src/lib/usage";

describe("brand voice terms", () => {
  const terms = [{ from: "customer", to: "patient" }];

  it("swaps whole words, keeping case and plurals", () => {
    expect(applyTerms("Other customers felt the same, customer first. Customer? CUSTOMER!", terms)).toBe(
      "Other patients felt the same, patient first. Patient? PATIENT!",
    );
  });

  it("does not touch partial words", () => {
    expect(applyTerms("customerservice and customary", terms)).toBe("customerservice and customary");
  });

  it("applies longer phrases before single words", () => {
    const t = [
      { from: "account", to: "chart" },
      { from: "account number", to: "patient ID" },
    ];
    expect(applyTerms("What's your account number? Check the account.", t)).toBe(
      "What's your patient ID? Check the chart.",
    );
  });

  it("flows through resolved guidance and extra triggers", () => {
    const content = mergeContent({
      brandVoice: {
        terms,
        extraTriggers: [{ phrase: "No problem.", why: "Implies there was a problem.", instead: "Happy to help, customer." }],
      },
    });
    const g = resolveGuidance("sage", "distressed", content)!;
    expect(g.phrasesToUse.join(" ")).toMatch(/patients/i);
    expect(g.phrasesToUse.join(" ")).not.toMatch(/customer/i);
    expect(g.triggers[0]).toMatchObject({ phrase: "No problem.", instead: "Happy to help, patient." });
  });
});

describe("content import/export", () => {
  it("round-trips: exported defaults validate and merge back to the same guidance", () => {
    const exported = JSON.parse(JSON.stringify(exportContent(defaultContent)));
    const v = validateContent(exported);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const merged = mergeContent(v.overrides);
    for (const a of agents) {
      for (const c of customers) {
        expect(resolveGuidance(a.id, c.id, merged)).toEqual(resolveGuidance(a.id, c.id));
      }
    }
  });

  it("merges a partial file: one node and one customer field", () => {
    const v = validateContent({
      interactionMatrix: [
        {
          agentId: "sage",
          customerId: "cooperative",
          fit: "watch",
          risk: "Custom risk.",
          relateStrategy: "Custom strategy.",
          phrasesToUse: ["Custom phrase."],
          phrasesToAvoid: ["Custom avoid."],
        },
      ],
      customerProfiles: [{ id: "hesitant", cue: "Unsure" }],
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const merged = mergeContent(v.overrides);
    expect(merged.interactionMatrix).toHaveLength(36);
    const g = resolveGuidance("sage", "cooperative", merged)!;
    expect(g).toMatchObject({ fit: "watch", risk: "Custom risk." });
    expect(merged.interactionMatrix.find((n) => n.agentId === "sage" && n.customerId === "cooperative")?.basis).toBe("custom");
    expect(merged.customerProfiles.find((c) => c.id === "hesitant")?.cue).toBe("Unsure");
    // untouched fields and nodes keep their defaults
    expect(merged.customerProfiles.find((c) => c.id === "hesitant")?.name).toBe("The Hesitant");
    expect(resolveGuidance("fixer", "demanding", merged)).toEqual(resolveGuidance("fixer", "demanding"));
  });

  it("rejects bad files with readable errors", () => {
    const v = validateContent({
      format: "something-else",
      interactionMatrix: [{ agentId: "wizard", customerId: "demanding", fit: "great" }],
      customerProfiles: [{ id: "grumpy" }],
      brandVoice: { terms: [{ from: "customer" }] },
    });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    const all = v.errors.join("\n");
    expect(all).toMatch(/format/);
    expect(all).toMatch(/interactionMatrix\[0\].*agentId.*fit.*risk/s);
    expect(all).toMatch(/customerProfiles\[0\].*id/);
    expect(all).toMatch(/brandVoice\.terms/);
  });

  it("rejects non-objects and wrong versions", () => {
    expect(validateContent([]).ok).toBe(false);
    expect(validateContent({ version: 2 }).ok).toBe(false);
  });
});

describe("usage log", () => {
  const events: UsageEvent[] = [
    { t: "2026-09-23T10:00:00.000Z", type: "select", agentId: "sage", customerId: "demanding", source: "click" },
    { t: "2026-09-23T10:00:05.000Z", type: "copy", agentId: "sage", customerId: "demanding", phrase: 'Here\'s what we know, "exactly".' },
    { t: "2026-09-23T10:05:00.000Z", type: "select", agentId: "sage", customerId: "demanding", source: "suggestion" },
    { t: "2026-09-23T10:09:00.000Z", type: "select", agentId: "sage", customerId: "hesitant", source: "key" },
    { t: "2026-09-23T10:09:03.000Z", type: "copy", agentId: "sage", customerId: "hesitant", phrase: "=HYPERLINK(evil)" },
  ];

  it("summarizes selections, sources, top pairs and phrases", () => {
    const s = summarize(events);
    expect(s).toMatchObject({ selections: 3, copies: 2, bySource: { click: 1, key: 1, suggestion: 1 } });
    expect(s.topPairs[0]).toEqual({ agentId: "sage", customerId: "demanding", count: 2 });
    expect(s.topPhrases).toHaveLength(2);
  });

  it("exports CSV with quoting and formula-injection protection", () => {
    const lines = toCsv(events).trimEnd().split("\r\n");
    expect(lines[0]).toBe("timestamp,event,agent,customer,source,phrase,suggested,suggestion_confidence,suggested_by,agreed");
    expect(lines).toHaveLength(6);
    expect(lines[2]).toBe(`2026-09-23T10:00:05.000Z,copy,sage,demanding,,"Here's what we know, ""exactly"".",,,,`);
    expect(lines[5].endsWith(",'=HYPERLINK(evil),,,,")).toBe(true);
  });

  describe("suggestion vs. agent's pick (correction log)", () => {
    const picks: UsageEvent[] = [
      { t: "1", type: "select", agentId: "sage", customerId: "demanding", source: "suggestion", suggested: "demanding", confidence: "clear", by: "model" },
      { t: "2", type: "select", agentId: "sage", customerId: "distressed", source: "click", suggested: "demanding", confidence: "close", by: "model" },
      { t: "3", type: "select", agentId: "sage", customerId: "distressed", source: "key", suggested: "demanding", confidence: "close", by: "keywords" },
      { t: "4", type: "select", agentId: "sage", customerId: "hesitant", source: "click" },
    ];

    it("counts agreement overall and by confidence, and the most frequent overrides", () => {
      const s = summarize(picks).suggestions;
      expect(s).toMatchObject({ shown: 3, agreed: 1 });
      expect(s.byConfidence.clear).toEqual({ shown: 1, agreed: 1 });
      expect(s.byConfidence.close).toEqual({ shown: 2, agreed: 0 });
      expect(s.topOverrides).toEqual([{ suggested: "demanding", chosen: "distressed", count: 2 }]);
    });

    it("exports the suggestion columns, and leaves them empty when nothing was suggested", () => {
      const lines = toCsv(picks).trimEnd().split("\r\n");
      expect(lines[2]).toBe("2,select,sage,distressed,click,,demanding,close,model,no");
      expect(lines[4]).toBe("4,select,sage,hesitant,click,,,,,");
    });

    it("stores no text beyond type ids", () => {
      expect(JSON.stringify(picks.slice(0, 3))).not.toMatch(/"(text|line|said)"/);
    });
  });
});

describe("demo scenarios", () => {
  it("use valid archetypes and cover five different agent styles", () => {
    const agentIds = agents.map((a) => a.id);
    const customerIds = customers.map((c) => c.id);
    for (const s of scenarios) {
      expect(agentIds).toContain(s.agentId);
      expect(customerIds).toContain(s.expectedCustomerId);
    }
    expect(new Set(scenarios.map((s) => s.agentId)).size).toBe(scenarios.length);
  });

  it("step through listen → guide → next scenario, and back", () => {
    let s = { index: 0, beat: "listen" as const };
    const seen: string[] = [];
    for (let cur: ReturnType<typeof nextDemo> = s; cur; cur = nextDemo(cur)) seen.push(`${cur.index}${cur.beat[0]}`);
    expect(seen).toHaveLength(scenarios.length * 2);
    expect(prevDemo(s)).toBeNull();
    expect(prevDemo({ index: 1, beat: "listen" })).toEqual({ index: 0, beat: "guide" });
  });
});
