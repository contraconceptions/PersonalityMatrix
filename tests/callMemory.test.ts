import { describe, expect, it } from "vitest";
import { combine, commit, commitChoice, emptyCall, IDLE_RESET_MS, MAX_LINES } from "../src/lib/callMemory";
import { rank } from "../src/lib/similarity";
import type { CustomerId } from "../src/lib/types";

const TYPES: CustomerId[] = ["analytical", "distressed", "demanding", "hesitant", "expressive", "cooperative"];

/** A line classification with the given probabilities (the rest share what's left). */
function line(probs: Partial<Record<CustomerId, number>>) {
  const rest = (1 - Object.values(probs).reduce((a, b) => a + b, 0)) / (TYPES.length - Object.keys(probs).length);
  return rank(Object.fromEntries(TYPES.map((t) => [t, Math.log(probs[t] ?? rest)])) as Record<CustomerId, number>);
}

describe("call memory", () => {
  const angry = line({ demanding: 0.9 });
  const unclear = line({ demanding: 0.4, distressed: 0.42 });

  it("changes nothing on the first line", () => {
    const r = combine(unclear, emptyCall());
    expect(r.ranked[0].customerId).toBe("distressed");
    expect(r.callLines).toBe(0);
  });

  it("lets earlier lines settle an unclear line", () => {
    const memory = commit(emptyCall(), angry, 1000);
    const r = combine(unclear, memory, 2000);
    expect(r.ranked[0].customerId).toBe("demanding");
    expect(r.confidence).toBe("clear");
    expect(r.callLines).toBe(1);
  });

  it("still follows a clear change in the latest line", () => {
    const memory = commit(emptyCall(), angry, 1000);
    const r = combine(line({ cooperative: 0.97 }), memory, 2000);
    expect(r.ranked[0].customerId).toBe("cooperative");
  });

  it("counts older lines less than recent ones", () => {
    let memory = commit(emptyCall(), line({ hesitant: 0.9 }), 1000);
    memory = commit(memory, line({ analytical: 0.9 }), 2000);
    expect(combine(line({}), memory, 3000).ranked[0].customerId).toBe("analytical");
  });

  it("uses history alone when the latest line has no signal", () => {
    const memory = commit(emptyCall(), angry, 1000);
    const silent = { ...line({}), signal: false };
    expect(combine(silent, memory, 2000).ranked[0].customerId).toBe("demanding");
  });

  it("doesn't commit lines without a signal, but does commit weak ones", () => {
    expect(commit(emptyCall(), { ...unclear, signal: false }).lines).toHaveLength(0);
    expect(commit(emptyCall(), { ...unclear, confidence: "none" }).lines).toHaveLength(1);
  });

  it("records the agent's pick when it differs from the line's own top type", () => {
    const memory = commitChoice(emptyCall(), unclear, "hesitant", 1000);
    expect(combine(line({}), memory, 2000).ranked[0].customerId).toBe("hesitant");
    expect(commitChoice(emptyCall(), angry, "demanding", 1000).lines[0]).toBe(angry.logProbs);
  });

  it("forgets the call after a long idle gap", () => {
    const memory = commit(emptyCall(), angry, 0);
    expect(combine(unclear, memory, IDLE_RESET_MS + 1).callLines).toBe(0);
  });

  it(`keeps at most ${MAX_LINES} lines and stores no text`, () => {
    let memory = emptyCall();
    for (let i = 0; i < MAX_LINES + 5; i++) memory = commit(memory, angry, i);
    expect(memory.lines).toHaveLength(MAX_LINES);
    expect(JSON.stringify(memory)).not.toMatch(/[a-z]{3,} [a-z]{3,}/); // numbers and type ids only
  });
});
