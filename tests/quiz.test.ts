import { describe, expect, it } from "vitest";
import { agents } from "../src/lib/matrix";
import { questions, scoreQuiz } from "../src/lib/quiz";
import type { AgentId } from "../src/lib/types";

const agentIds = agents.map((a) => a.id);

// For each question, pick the option that gives `id` the most points.
function answersFavoring(id: AgentId): number[] {
  return questions.map((q) => {
    let best = 0;
    q.options.forEach((o, i) => {
      if ((o.scores[id] ?? 0) > (q.options[best].scores[id] ?? 0)) best = i;
    });
    return best;
  });
}

describe("quiz data", () => {
  it("has 8–12 questions, each with 3–5 options", () => {
    expect(questions.length).toBeGreaterThanOrEqual(8);
    expect(questions.length).toBeLessThanOrEqual(12);
    for (const q of questions) {
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      expect(q.options.length).toBeLessThanOrEqual(5);
    }
  });

  it("only scores known archetypes", () => {
    for (const q of questions) {
      for (const o of q.options) {
        for (const id of Object.keys(o.scores)) expect(agentIds).toContain(id);
      }
    }
  });

  it("gives every archetype a primary (2-point) option in at least 5 questions", () => {
    for (const id of agentIds) {
      const count = questions.filter((q) => q.options.some((o) => o.scores[id] === 2)).length;
      expect(count, id).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("scoreQuiz", () => {
  it.each(agentIds)("can recommend %s", (id) => {
    expect(scoreQuiz(answersFavoring(id))[0].agentId).toBe(id);
  });

  it("returns every archetype, sorted, with scores between 0 and 1", () => {
    const ranked = scoreQuiz(questions.map(() => 0));
    expect(ranked).toHaveLength(6);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
    for (const r of ranked) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it("ignores out-of-range answers", () => {
    expect(() => scoreQuiz([99, -1])).not.toThrow();
  });
});
