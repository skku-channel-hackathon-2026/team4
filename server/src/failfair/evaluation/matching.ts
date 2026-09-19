import { mkdir, writeFile } from "node:fs/promises";
import {
  DEMO_CASES,
  GOLDEN_QUERIES,
  type ActionCandidate,
} from "@tutorial/shared";
import {
  matchActions,
  rankCases,
  MATCH_WEIGHTS,
} from "../retrieval.service.js";

// Inspect source case ids, field contributions and output cards without any API key.
const results = GOLDEN_QUERIES.map((query) => {
  const actions: ActionCandidate[] = query.actions.map((a, i) => ({
    id: `action-${i + 1}`,
    label: a.actionTag,
    actionTag: a.actionTag,
    origin: "student",
    confirmed: true,
  }));
  return {
    id: query.id,
    situation: query.situation,
    rankings: actions.map((action) => ({
      action,
      top: rankCases(query.situation, action, DEMO_CASES)
        .slice(0, 3)
        .map(({ item, info }) => ({
          caseId: item.id,
          title: item.title,
          ...info,
        })),
    })),
    cards: matchActions(query.situation, actions, DEMO_CASES),
  };
});
await mkdir("evaluation-results", { recursive: true });
await writeFile(
  "evaluation-results/matching-report.json",
  JSON.stringify(
    {
      weights: MATCH_WEIGHTS,
      source: "bundled demo cases; no live database or AI calls",
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Wrote ${results.length} comparisons to evaluation-results/matching-report.json`,
);
