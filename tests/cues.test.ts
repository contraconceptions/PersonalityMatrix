import { describe, expect, it } from "vitest";
import { detectCues, normalize } from "../src/lib/cues";
import { mergeContent, validateContent } from "../src/lib/content";
import { cues, customers } from "../src/lib/matrix";

const top = (text: string) => {
  const { scores } = detectCues(text, cues);
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0];
};
const whys = (text: string) => detectCues(text, cues).hits.map((h) => `${h.customerId}:${h.why}`);

describe("cue data", () => {
  it("every pattern compiles and every family targets a known type", () => {
    const ids = new Set(customers.map((c) => c.id));
    for (const f of cues) {
      expect(ids.has(f.customerId), f.why).toBe(true);
      expect(f.weight).toBeGreaterThan(0);
      for (const p of f.patterns) expect(() => new RegExp(p, "g"), p).not.toThrow();
    }
  });

  it("gives every customer type at least three cue families", () => {
    for (const c of customers) expect(cues.filter((f) => f.customerId === c.id).length, c.id).toBeGreaterThanOrEqual(3);
  });
});

describe("detectCues", () => {
  it("normalizes case and curly apostrophes", () => {
    expect(normalize("I DON’T  know")).toBe("i don't know");
  });

  it("reads absolutes by direction: aimed at the company vs. at oneself", () => {
    expect(top("You people never get my bill right")).toBe("demanding");
    expect(top("Nothing ever works for me, I always mess these things up")).toBe("distressed");
  });

  it("ignores negated emotion cues", () => {
    expect(whys("I'm not upset, I just want the exact date")).not.toContain("demanding:agent note");
    expect(top("I'm not upset, I just want the exact date")).toBe("analytical");
    expect(whys("I'm not scared of it")).not.toContain("distressed:fear or anxiety");
  });

  it("doesn't count hedged or conditional agreement as cooperative", () => {
    expect(top("I'm not sure about this")).toBe("hesitant");
    expect(top("Is there any risk if I go ahead with this?")).toBe("hesitant");
    expect(top("Sure, go ahead")).toBe("cooperative");
  });

  it("recognizes agent shorthand and unpunctuated speech-to-text", () => {
    expect(top("cust very angry, threatening to cancel")).toBe("demanding");
    expect(top("caller crying cant access account")).toBe("distressed");
    expect(top("i dont know what to do they said theyll cut the water off")).toBe("distressed");
  });

  it("reads a calm, negated-emotion fact request as analytical", () => {
    expect(top("I'm not upset, I just want to understand how you got to that number")).toBe("analytical");
    expect(whys("I just need to know when the refund posts")).toContain("analytical:calm fact-finding");
  });

  it("treats job and income loss as high stakes", () => {
    expect(whys("I just lost my job and can't afford this")).toContain("distressed:high stakes");
    expect(whys("we're behind on rent")).toContain("distressed:high stakes");
  });

  it("counts each family once and reports the matched words", () => {
    const r = detectCues("supervisor! supervisor! get me a supervisor", cues);
    expect(r.hits.filter((h) => h.why === "escalation demand")).toHaveLength(1);
    expect(r.hits[0]).toMatchObject({ customerId: "demanding", match: "supervisor" });
  });

  it("returns nothing for neutral text", () => {
    expect(detectCues("hello can you hear me", cues).hits).toEqual([]);
  });
});

describe("cue import", () => {
  const family = { customerId: "demanding", why: "client term", weight: 1, patterns: ["\\bombudsman\\b"] };

  it("accepts a valid cues section and replaces the built-in cues", () => {
    const v = validateContent({ cues: [family] });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const merged = mergeContent(v.overrides);
    expect(merged.cues).toHaveLength(1);
    expect(detectCues("I'm calling the ombudsman", merged.cues).hits[0].customerId).toBe("demanding");
  });

  it("rejects bad types, weights and patterns with readable errors", () => {
    const v = validateContent({
      cues: [
        { ...family, customerId: "angry" },
        { ...family, weight: 9 },
        { ...family, patterns: ["(unclosed"] },
      ],
    });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.join(" ")).toMatch(/customerId/);
    expect(v.errors.join(" ")).toMatch(/weight/);
    expect(v.errors.join(" ")).toMatch(/\(unclosed/);
  });
});
