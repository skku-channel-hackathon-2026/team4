/** Frozen pre-fix audit. Synthetic new domains + metamorphic contracts.
 * No expected IDs or audit phrases are imported by production matching. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  DEMO_CASES,
  CaseSchema,
  SituationSchema,
  type Case,
  type Situation,
  type ActionCandidate,
} from "@tutorial/shared";
import { rankCases, matchActions } from "../retrieval.service.js";
const scenarios = [
  {
    category: "grades" as const,
    tag: "ask_help",
    type: "course_access",
    text: "실험 수업 자료가 화면 낭독기로 읽히지 않아서 과제를 시작하지 못했다",
    query: "화면 낭독기로 실험 자료를 읽을 수 없어 과제 시작이 막혔어요",
    goal: "접근 가능한 실험 자료 받기",
    constraint: "남은 기간 120분",
    other: "시험 응시 장소를 착각해서 출석 확인을 요청했다",
    otherGoal: "시험 출석 인정받기",
  },
  {
    category: "team_project" as const,
    tag: "inform_professor",
    type: "data_loss",
    text: "공동 저장소 파일이 삭제되어 실험 결과를 복구해야 했다",
    query: "공동 저장소에서 실험 결과 파일이 삭제됐어요. 복구가 필요해요",
    goal: "실험 결과 파일 복구",
    constraint: "가용 인원 2명",
    other: "외부 발표 장소의 예약이 취소되어 다른 장소를 찾았다",
    otherGoal: "새 발표 장소 예약",
  },
  {
    category: "club" as const,
    tag: "reduce_role",
    type: "accessibility",
    text: "행사장 계단 때문에 장비 운반을 못해서 다른 동선을 구했다",
    query: "행사장 계단 때문에 장비를 옮길 수 없어 다른 동선이 필요해요",
    goal: "안전한 장비 운반 동선 마련",
    constraint: "대체 인원 없음",
    other: "회비 사용 내역이 누락되어 영수증을 다시 모았다",
    otherGoal: "회비 사용 내역 정산",
  },
];
const rows: { id: string; kind: string; pass: boolean; error?: string }[] = [];
function check(id: string, kind: string, fn: () => void) {
  try {
    fn();
    rows.push({ id, kind, pass: true });
  } catch (e) {
    rows.push({
      id,
      kind,
      pass: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
for (const [i, p] of scenarios.entries()) {
  const action: ActionCandidate = {
    id: "audit",
    label: "확인한 행동",
    actionTag: p.tag,
    origin: "student",
    confirmed: true,
  };
  const base: Case = CaseSchema.parse({
    ...DEMO_CASES[0],
    id: `near-${i}`,
    category: p.category,
    problemType: p.type,
    situation: p.text,
    goal: p.goal,
    constraints: [p.constraint],
    urgency: "week",
    actionSteps: [
      { order: 1, actionTag: p.tag, description: "상황을 확인하고 행동했다" },
    ],
    sourceType: "demo",
    status: "approved",
  });
  const far: Case = {
    ...base,
    id: `far-${i}`,
    problemType: "different_problem",
    situation: p.other,
    goal: p.otherGoal,
    constraints: [],
  };
  const student: Situation = SituationSchema.parse({
    category: p.category,
    situation: p.query,
    goal: p.goal,
    constraints: [p.constraint],
    problemType: p.type,
    deadline: { raw: "이번 주", urgency: "week" },
  });
  const cases = [far, base];
  const options = { source: "demo" as const };
  const rank = (cs: Case[] = cases, s: Situation = student) =>
    rankCases(s, action, cs, options);
  const signature = (cs: Case[] = cases, s: Situation = student) =>
    JSON.stringify(
      rank(cs, s).map((r) => ({
        id: r.item.id,
        score: r.info.score,
        components: r.info.components,
      })),
    );
  const expected = signature();
  check(`${i}-new-wording`, "ranking", () =>
    assert.equal(rank()[0].item.id, base.id),
  );
  check(`${i}-missing-type`, "ranking", () =>
    assert.equal(
      rank(cases, { ...student, problemType: undefined })[0].item.id,
      base.id,
    ),
  );
  check(`${i}-missing-goal`, "ranking", () =>
    assert.equal(rank(cases, { ...student, goal: "" })[0].item.id, base.id),
  );
  check(`${i}-context-only`, "ranking", () =>
    assert.equal(
      rank(cases, {
        ...student,
        goal: "",
        problemType: undefined,
        constraints: [],
        deadline: { raw: "", urgency: "unknown" },
      })[0].item.id,
      base.id,
    ),
  );
  check(`${i}-order`, "invariant", () =>
    assert.equal(signature([...cases].reverse()), expected),
  );
  check(`${i}-repeated-input`, "invariant", () =>
    assert.equal(
      signature(cases, {
        ...student,
        situation: student.situation + " " + student.situation,
      }),
      expected,
    ),
  );
  check(`${i}-unapproved`, "invariant", () =>
    assert.equal(
      signature([...cases, { ...base, id: "hidden", status: "hidden" }]),
      expected,
    ),
  );
  check(`${i}-different-source`, "invariant", () =>
    assert.equal(
      signature([...cases, { ...base, id: "real", sourceType: "real" }]),
      expected,
    ),
  );
  check(`${i}-other-action-corpus`, "invariant", () =>
    assert.equal(
      signature([
        ...cases,
        {
          ...base,
          id: "other-action",
          situation: student.situation,
          actionSteps: [
            {
              order: 1,
              actionTag: "not_selected",
              description: "선택하지 않은 행동",
            },
          ],
        },
      ]),
      expected,
    ),
  );
  check(`${i}-metadata`, "invariant", () =>
    assert.equal(
      signature(
        cases.map((c) => ({
          ...c,
          title: student.situation,
          tags: ["성공"],
          outcome: { shortTerm: "모두 성공", followUp: "", unresolved: "" },
        })),
      ),
      expected,
    ),
  );
  check(`${i}-unknown-is-not-match`, "contract", () =>
    assert.equal(
      matchActions(
        {
          ...student,
          situation: "",
          goal: "",
          problemType: undefined,
          constraints: [],
          progress: "",
        },
        [action],
        cases,
        options,
      )[0].status,
      "reference",
    ),
  );
  check(`${i}-contradictory-record`, "contract", () => {
    const conflicting = {
      ...base,
      constraints: ["가용 인원 2명", "가용 인원 5명"],
    };
    const s = { ...student, constraints: ["가용 인원 2명"] };
    const info = rank([conflicting], s)[0].info;
    assert.ok(
      info.components.constraints <= 0,
      "A contradictory same-subject record must not receive positive exact-constraint credit",
    );
    assert.equal(
      matchActions(s, [action], [conflicting], options)[0].status,
      "reference",
    );
  });
  check(`${i}-bounded-votes`, "contract", () => {
    for (const r of rank())
      for (const v of Object.values(r.info.distributed!.contributions))
        assert.ok(Math.abs(v) <= 20);
  });
}
const label = process.argv[2] ?? "latest";
if (!/^[\w-]+$/.test(label)) throw Error("Invalid label");
const report = {
  label,
  fixtureHash: createHash("sha256")
    .update(await readFile(new URL(import.meta.url)))
    .digest("hex"),
  source:
    "Synthetic new situations; 12 ranking probes and 27 structural checks, not real-world accuracy",
  summary: { total: rows.length, passed: rows.filter((r) => r.pass).length },
  rows,
};
await mkdir("evaluation-results", { recursive: true });
await writeFile(
  `evaluation-results/final-audit-${label}.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({ ...report, rows: rows.filter((r) => !r.pass) }, null, 2),
);
if (rows.some((r) => !r.pass)) process.exitCode = 1;
