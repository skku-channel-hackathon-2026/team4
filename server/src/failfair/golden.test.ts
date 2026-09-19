import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTION_TAGS,
  CaseSchema,
  DEMO_CASES,
  GOLDEN_QUERIES,
  type ActionCandidate,
} from "@tutorial/shared";
import { matchActions, rankCases } from "./retrieval.service.js";

/**
 * 사례 데이터 자체를 지키는 테스트 (v2 §14).
 * 사례를 추가·수정했을 때 §5.3의 분기가 무너지면 여기서 걸린다.
 * 기대값은 packages/shared/src/cases.golden.ts에 있고 D가 소유한다.
 */

const candidate = (actionTag: string): ActionCandidate => ({
  id: `a-${actionTag}`,
  label: actionTag,
  actionTag,
  origin: "student",
  confirmed: true,
});

test("모든 데모 사례가 공통 계약을 통과한다", () => {
  for (const item of DEMO_CASES) {
    const parsed = CaseSchema.safeParse(item);
    assert.ok(parsed.success, `${item.id}: ${parsed.error?.message}`);
  }
});

test("사례 id가 중복되지 않는다", () => {
  const ids = DEMO_CASES.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("데모 사례는 승인 상태와 가상 출처를 유지한다", () => {
  for (const item of DEMO_CASES) {
    assert.equal(item.status, "approved", `${item.id}: 승인 상태가 아닙니다`);
    assert.equal(item.sourceType, "demo", `${item.id}: 가상 출처가 아닙니다`);
  }
});

test("사례가 쓰는 행동 태그는 모두 ACTION_TAGS에 있다", () => {
  for (const item of DEMO_CASES) {
    const known = new Set(ACTION_TAGS[item.category].map((entry) => entry.tag));
    for (const step of item.actionSteps) {
      assert.ok(
        known.has(step.actionTag),
        `${item.id}의 "${step.actionTag}"가 ${item.category} ACTION_TAGS에 없습니다. 목록에 없으면 학생이 그 행동을 고를 수 없어 사례가 영영 검색되지 않습니다.`,
      );
    }
  }
});

test("망한 선배 사례는 대가와 미해결을 함께 남긴다", () => {
  // 성공담만 모이면 이 서비스의 전제가 무너진다. 최소한 한쪽은 비어 있으면 안 된다.
  for (const item of DEMO_CASES) {
    assert.ok(
      item.receipt.cost.length > 0,
      `${item.id}: receipt.cost가 비어 있습니다`,
    );
    const admitsLimits =
      item.outcome.unresolved.length > 0 || item.receipt.status !== "resolved";
    assert.ok(
      admitsLimits,
      `${item.id}: unresolved가 비어 있는데 status도 resolved입니다. 남은 문제가 정말 없는지 확인하세요`,
    );
  }
});

test("복구 도구에는 사용할 시점이나 조건이 있다", () => {
  for (const item of DEMO_CASES) {
    if (!item.tool) continue;
    assert.ok(
      item.tool.usageNote.trim().length > 0,
      `${item.id}: tool.usageNote가 비어 있습니다`,
    );
  }
});

for (const query of GOLDEN_QUERIES) {
  test(`${query.id}: ${query.intent}`, () => {
    const results = matchActions(
      query.situation,
      query.actions.map((expected) => candidate(expected.actionTag)),
      DEMO_CASES,
    );

    query.actions.forEach((expected, index) => {
      const result = results[index];
      assert.ok(result, `${expected.actionTag} 결과가 없습니다`);
      assert.equal(
        result.status,
        expected.expectStatus,
        `${expected.actionTag}: status가 ${result.status}입니다`,
      );

      const ranked = rankCases(
        query.situation,
        candidate(expected.actionTag),
        DEMO_CASES,
      );
      const rankedIds = ranked.map((entry) => entry.item.id);

      if (expected.expectTopCaseId) {
        assert.equal(rankedIds[0], expected.expectTopCaseId);
      }
      for (const id of expected.expectRanked ?? []) {
        assert.ok(
          rankedIds.includes(id),
          `${expected.actionTag}: ${id}가 후보에 없습니다 (후보: ${rankedIds.join(", ")})`,
        );
      }
      if (expected.expectStatus === "matched") {
        assert.equal(
          ranked[0]?.info.actionMatched,
          true,
          `${expected.actionTag}: 1순위가 이 행동을 실제로 한 사례가 아닙니다`,
        );
      }
      if (expected.expectStatus === "reference") {
        // 그 행동을 한 선배가 하나도 없어야 "참고 사례"가 성립한다.
        assert.ok(
          ranked.every((entry) => !entry.info.actionMatched),
          `${expected.actionTag}: 사례가 0건이어야 하는데 실제로 한 선배가 있습니다`,
        );
      }
    });

    if (query.expectMultiActionCaseId) {
      // 한 사례가 나열된 모든 행동에서 "실제로 한 사례"로 잡혀야 한다.
      // 1순위로 뽑히는지는 다른 사례와의 경쟁 결과라 여기서 고정하지 않는다.
      for (const expected of query.actions) {
        const entry = rankCases(
          query.situation,
          candidate(expected.actionTag),
          DEMO_CASES,
        ).find((ranked) => ranked.item.id === query.expectMultiActionCaseId);
        assert.ok(
          entry?.info.actionMatched,
          `${query.expectMultiActionCaseId}가 ${expected.actionTag}에서 실제 행동으로 잡히지 않았습니다`,
        );
      }
    }
  });
}
