import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  CaseSchema,
  SituationSchema,
  type ActionCandidate,
  type Case,
} from "@tutorial/shared";
import {
  matchActions as matchWithSource,
  rankCases as rankWithSource,
} from "../retrieval.service.js";
import {
  BENCHMARK_CASES,
  BENCHMARK_QUERIES,
} from "./fixtures/matching-benchmark.js";

import { CHALLENGE_QUERIES } from "./fixtures/matching-challenges.js";

import { DISTRIBUTED_QUERIES } from "./fixtures/distributed-matching.js";

import { DIMENSIONS, type Dimension } from "../distributed-score.js";

const option = (key: string, fallback: string) => {
  const index = process.argv.indexOf(`--${key}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
};
const label = option("label", "local");
const omitted = option("omit", "").split(",").filter(Boolean);
if (omitted.some((key) => !DIMENSIONS.includes(key as Dimension)))
  throw new Error("Unknown dimension");
const suite = option("suite", "standard");
if (!["standard", "challenge", "distributed"].includes(suite))
  throw new Error("Invalid suite");
const allQueries =
  suite === "distributed"
    ? DISTRIBUTED_QUERIES
    : suite === "challenge"
      ? CHALLENGE_QUERIES
      : BENCHMARK_QUERIES;
const split = option("split", "all");
if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw new Error("Invalid label");
if (!["all", "development", "validation"].includes(split))
  throw new Error("Invalid split");
const queries = allQueries.filter((q) => split === "all" || q.split === split);
// Hash the full fixed data so before/after reports cannot silently use different judgments.
const fixtureHash = createHash("sha256")
  .update(JSON.stringify({ cases: BENCHMARK_CASES, queries: allQueries }))
  .digest("hex");
const rows = queries.map((q) => {
  SituationSchema.parse(q.situation);
  const cases = (q.cases ?? BENCHMARK_CASES).map((c) => CaseSchema.parse(c));
  const action: ActionCandidate = {
    id: "selected",
    label: "학생 확인 행동",
    actionTag: q.actionTag,
    confirmed: true,
    origin: "student",
  };
  const durations: number[] = [];
  for (let i = 0; i < 12; i++) {
    const start = performance.now();
    matchActions(q.situation, [action], cases);
    if (i >= 2) durations.push(performance.now() - start);
  }
  const ranked = rankCases(q.situation, action, cases);
  const card = matchActions(q.situation, [action], cases)[0];
  const rank = ranked.findIndex((r) => q.acceptableIds.includes(r.item.id)) + 1;
  const pass =
    q.kind === "ranking"
      ? rank === 1
      : q.kind === "abstention"
        ? card.status === "no_case"
        : card.differences.some((s) => s.includes("정보는 부족"));
  const signature = (inputCases: Case[]) =>
    JSON.stringify(
      rankCases(q.situation, action, inputCases).map((r) => [
        r.item.id,
        r.info.score,
      ]),
    );
  const original = signature(cases);
  // These transformations must not change judgments, and are not more independent queries.
  const invariants = {
    repositoryOrder: signature([...cases].reverse()) === original,
    outcomeIsolation:
      signature(
        cases.map((c) => ({
          ...c,
          outcome: {
            shortTerm: "대성공 4.5점",
            followUp: "전원 합격",
            unresolved: "",
          },
          receipt: { ...c.receipt, cost: "비용 없음" },
        })),
      ) === original,
    categoryApproval:
      rankCases(
        q.situation,
        action,
        cases.map((c) => ({ ...c, status: "hidden" })),
      ).length === 0,
    repetition:
      JSON.stringify(
        rankCases(
          {
            ...q.situation,
            situation: `${q.situation.situation} ${q.situation.situation}`,
          },
          action,
          cases,
        ).map((r) => [r.item.id, r.info.score]),
      ) === original,
  };
  return {
    id: q.id,
    split: q.split,
    kind: q.kind,
    note: q.note,
    situation: q.situation,
    expected: q.acceptableIds,
    pass,
    rank: rank || null,
    reciprocalRank: rank ? 1 / rank : 0,
    status: card.status,
    actual: card.caseId ?? null,
    top: ranked.slice(0, 3).map((r) => ({ id: r.item.id, ...r.info })),
    invariants,
    durations,
  };
});
const summary = (subset: typeof rows) => {
  const ranking = subset.filter((r) => r.kind === "ranking");
  const abstention = subset.filter((r) => r.kind === "abstention");
  const weak = subset.filter((r) => r.kind === "weak-evidence");
  const durations = subset.flatMap((r) => r.durations).sort((a, b) => a - b);
  return {
    queries: subset.length,
    passed: subset.filter((r) => r.pass).length,
    ranking: {
      total: ranking.length,
      top1: ranking.filter((r) => r.pass).length,
      mrr: ranking.length
        ? ranking.reduce((s, r) => s + r.reciprocalRank, 0) / ranking.length
        : null,
    },
    abstention: {
      total: abstention.length,
      correct: abstention.filter((r) => r.pass).length,
    },
    weakEvidence: {
      total: weak.length,
      disclosed: weak.filter((r) => r.pass).length,
    },
    invariants: {
      total: subset.length * 4,
      passed: subset.reduce(
        (n, r) => n + Object.values(r.invariants).filter(Boolean).length,
        0,
      ),
    },
    localP95Ms:
      durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] ?? null,
  };
};
const baselinePath = option("baseline", "");
let comparison;
if (baselinePath) {
  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as {
    fixtureHash: string;
    rows: { id: string; pass: boolean }[];
  };
  if (baseline.fixtureHash !== fixtureHash)
    throw new Error("Fixture changed; comparison rejected");
  const old = new Map(baseline.rows.map((r) => [r.id, r.pass]));
  if (rows.some((r) => !old.has(r.id)))
    throw new Error("Baseline is missing queries");
  comparison = {
    improved: rows.filter((r) => r.pass && !old.get(r.id)).map((r) => r.id),
    regressed: rows.filter((r) => !r.pass && old.get(r.id)).map((r) => r.id),
    unresolved: rows.filter((r) => !r.pass && !old.get(r.id)).map((r) => r.id),
  };
}
const report = {
  label,
  suite,
  omitted,
  fixtureHash,
  source:
    "Synthetic local retrieval checks, not independently labeled real student data. H→M only, no Gemini extraction or API calls.",
  summary: summary(rows),
  bySplit: {
    development: summary(rows.filter((r) => r.split === "development")),
    validation: summary(rows.filter((r) => r.split === "validation")),
  },
  comparison,
  rows,
};
await mkdir("evaluation-results", { recursive: true });
const path = `evaluation-results/matching-benchmark-${label}.json`;
await writeFile(path, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      path,
      fixtureHash,
      summary: report.summary,
      bySplit: report.bySplit,
      comparison,
      failures: rows
        .filter((r) => !r.pass)
        .map((r) => ({ id: r.id, expected: r.expected, actual: r.actual })),
    },
    null,
    2,
  ),
);
if (
  comparison?.regressed.length ||
  rows.some((r) => Object.values(r.invariants).some((ok) => !ok))
)
  process.exitCode = 1;

function rankCases(...args: Parameters<typeof rankWithSource>) {
  return rankWithSource(
    args[0],
    args[1],
    args[2],
    args[3] ?? { source: "demo", omitDimensions: omitted as Dimension[] },
  );
}
function matchActions(...args: Parameters<typeof matchWithSource>) {
  return matchWithSource(
    args[0],
    args[1],
    args[2],
    args[3] ?? { source: "demo", omitDimensions: omitted as Dimension[] },
  );
}
