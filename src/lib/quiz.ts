import quizData from "../data/quiz.json";
import { agents } from "./matrix";
import type { AgentId } from "./types";

export interface QuizOption {
  text: string;
  scores: Partial<Record<AgentId, number>>;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
}

export interface QuizResult {
  agentId: AgentId;
  /** Share of the maximum score this archetype could have earned, 0–1. */
  score: number;
}

export const questions = quizData as QuizQuestion[];

// The most points each archetype could earn across the whole quiz. Scores are
// normalized by this so archetypes that appear in more options aren't favored.
const maxPossible: Record<AgentId, number> = Object.fromEntries(
  agents.map((a) => [
    a.id,
    questions.reduce(
      (sum, q) => sum + Math.max(0, ...q.options.map((o) => o.scores[a.id] ?? 0)),
      0,
    ),
  ]),
) as Record<AgentId, number>;

/**
 * Rank archetypes for a set of answers (answers[i] = chosen option index for question i).
 * Ties keep the archetype order from agentProfiles.json.
 */
export function scoreQuiz(answers: number[]): QuizResult[] {
  const raw = Object.fromEntries(agents.map((a) => [a.id, 0])) as Record<AgentId, number>;

  answers.forEach((choice, i) => {
    const option = questions[i]?.options[choice];
    if (!option) return;
    for (const [id, pts] of Object.entries(option.scores) as [AgentId, number][]) {
      raw[id] += pts;
    }
  });

  return agents
    .map((a) => ({ agentId: a.id, score: maxPossible[a.id] ? raw[a.id] / maxPossible[a.id] : 0 }))
    .sort((x, y) => y.score - x.score);
}
