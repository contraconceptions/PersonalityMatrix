import { describe, expect, it } from "vitest";
import { mergeContent, validateContent } from "../src/lib/content";
import { moods } from "../src/lib/matrix";
import { CALM, detectMood, moodTrend } from "../src/lib/mood";

const mood = (text: string) => detectMood(text, moods).id;

describe("detectMood", () => {
  it("is calm when there's no emotional signal", () => {
    expect(detectMood("Can you send me the invoice for March?", moods)).toEqual(CALM);
    expect(mood("Sure, go ahead, thanks")).toBe("calm");
  });

  it("recognizes anxiety, frustration and escalation", () => {
    expect(mood("I'm so scared, I don't know what to do")).toBe("anxious");
    expect(mood("This is the third time I've called, I'm so fed up")).toBe("frustrated");
    expect(mood("Get me your supervisor or I'm cancelling")).toBe("escalating");
  });

  it("ranks escalation above frustration", () => {
    expect(mood("I'm fed up. I want your manager right now.")).toBe("escalating");
  });

  it("reads swearing and ALL-CAPS shouting as escalating", () => {
    expect(mood("this is bullshit")).toBe("escalating");
    expect(detectMood("I SAID CANCEL IT", moods).hits.map((h) => h.why)).toContain("shouting");
  });

  it("ignores negated emotions", () => {
    expect(mood("I'm not worried, just curious")).toBe("calm");
    expect(mood("I'm not frustrated with you")).toBe("calm");
  });

  it("works on agent notes", () => {
    expect(mood("caller yelling, wants refund")).toBe("escalating");
  });

  it("reports the words it matched", () => {
    expect(detectMood("I want a supervisor", moods).hits[0]).toEqual({ why: "escalation demand", match: "supervisor" });
  });
});

describe("moodTrend", () => {
  it("compares with the previous line", () => {
    expect(moodTrend(null, 2)).toBeNull();
    expect(moodTrend(0, 2.3)).toBe("rising");
    expect(moodTrend(2.3, 0)).toBe("easing");
    expect(moodTrend(1.2, 1.5)).toBe("steady");
  });
});

describe("mood import", () => {
  const custom = { id: "escalating", name: "Heated", tip: "Breathe.", phrasesToUse: ["I hear you."], cues: [{ why: "client word", weight: 2, patterns: ["\\bombudsman\\b"] }] };

  it("replaces a built-in mood by id and keeps the others", () => {
    const v = validateContent({ moods: [custom] });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const merged = mergeContent(v.overrides);
    expect(merged.moods.map((m) => m.id)).toEqual(moods.map((m) => m.id));
    expect(merged.moods.find((m) => m.id === "escalating")?.name).toBe("Heated");
    expect(detectMood("calling the ombudsman", merged.moods).id).toBe("escalating");
  });

  it("rejects unknown ids and bad cue patterns", () => {
    const v = validateContent({ moods: [{ ...custom, id: "sad" }, { ...custom, cues: [{ why: "x", weight: 1, patterns: ["(bad"] }] }] });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.join(" ")).toMatch(/"id" must be one of/);
    expect(v.errors.join(" ")).toMatch(/\(bad/);
  });
});
