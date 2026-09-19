import { tokenize } from "./text-similarity.js";

/** Equal maximum influence. Action, approval, category and source are gates,
 * not duplicate score bonuses. Unknown budgets are never redistributed. */
export const MATCH_WEIGHTS = {
  problem: 20,
  context: 20,
  constraints: 20,
  goal: 20,
  urgency: 20,
} as const;
export type Dimension = keyof typeof MATCH_WEIGHTS;
export type Components = Record<Dimension, number>;
export const DIMENSIONS = Object.keys(MATCH_WEIGHTS) as Dimension[];
// Existing lexical evidence thresholds. They gate the strength of rank votes,
// so the best of a set of barely related strings cannot get a full vote.
const EVIDENCE_SCALE: Components = {
  problem: 1,
  context: 0.12,
  constraints: 0.22,
  goal: 0.25,
  urgency: 1,
};
export interface ScoreInput {
  components: Components;
  studentTexts: Partial<Record<Dimension, string>>;
  caseTexts: Partial<Record<Dimension, string>>;
}
export interface DistributedScore {
  score: number;
  contributions: Components;
  budgets: Components;
  /** Relative evidence only, never an outcome probability. */
  supportingDimensions: Dimension[];
}
function identity(text: string | undefined) {
  return text ? [...new Set(tokenize(text))].sort().join(" ") : "";
}
function duplicateCount(texts: ScoreInput["studentTexts"], key: Dimension) {
  const value = identity(texts[key]);
  return value
    ? Math.max(1, DIMENSIONS.filter((k) => identity(texts[k]) === value).length)
    : 1;
}
export function distributedScores(
  inputs: ScoreInput[],
  omitted: readonly Dimension[] = [],
): DistributedScore[] {
  // Dense ranks over distinct values: identical candidates don't acquire extra
  // votes just because the same score occurs in more database rows.
  const values = Object.fromEntries(
    DIMENSIONS.map((key) => [
      key,
      [
        ...new Set(
          inputs.map((row) => row.components[key]).filter((v) => v > 0),
        ),
      ].sort((a, b) => a - b),
    ]),
  ) as Record<Dimension, number[]>;
  return inputs.map((row) => {
    const contributions = {} as Components;
    const budgets = {} as Components;
    for (const key of DIMENSIONS) {
      budgets[key] = omitted.includes(key)
        ? 0
        : MATCH_WEIGHTS[key] /
          Math.max(
            duplicateCount(row.studentTexts, key),
            duplicateCount(row.caseTexts, key),
          );
      const raw = Math.max(-1, Math.min(1, row.components[key]));
      const rankVote =
        raw > 0
          ? (values[key].indexOf(row.components[key]) + 1) / values[key].length
          : 0;
      const reliability = Math.min(1, Math.abs(raw) / EVIDENCE_SCALE[key]);
      contributions[key] =
        budgets[key] * (raw < 0 ? -reliability : rankVote * reliability);
    }
    return {
      score:
        Math.round(
          Object.values(contributions).reduce((a, b) => a + b, 0) * 100,
        ) / 100,
      contributions,
      budgets,
      supportingDimensions: DIMENSIONS.filter((key) => contributions[key] > 0),
    };
  });
}
