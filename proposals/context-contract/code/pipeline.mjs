import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
const read = (name) =>
  JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
  read("./situation.schema.json"),
);
export const vocabulary = read("./reference/vocab.json");
const axes = {
  problem_type: "problem_type",
  constraint_tags: "constraint_tag",
  urgency: "urgency",
  goal_tags: "goal_tag",
};

// Inputs must come from the authenticated server session, never from model output.
export function buildSearchInput(
  context,
  { messages, confirmedContext, approvedActionIds = [] },
) {
  if (!validate(context))
    return { status: "invalid", errors: structuredClone(validate.errors) };
  const errors = [];
  const messageMap = new Map(
    messages.filter((m) => m.role === "user").map((m) => [m.id, m.text]),
  );
  const evidenceValid = (e) =>
    messageMap.has(e.messageId) &&
    messageMap.get(e.messageId).includes(e.quote);
  function scan(x) {
    if (!x || typeof x !== "object") return;
    if ("messageId" in x && "quote" in x && !evidenceValid(x))
      errors.push("사용자 원문과 일치하지 않는 근거");
    for (const v of Object.values(x)) if (typeof v === "object") scan(v);
  }
  scan(context);
  const s = context.situation;
  const records = [
    ...s.facts,
    ...s.constraints,
    ...s.attemptedActions.items,
    ...s.consideredActions,
    ...s.interpretations,
    ...s.openQuestions,
  ];
  if (new Set(records.map((x) => x.id)).size !== records.length)
    errors.push("중복 ID");
  const factIds = new Set([...s.facts, ...s.constraints].map((x) => x.id));
  for (const i of s.interpretations)
    if (i.basedOnFactIds.some((id) => !factIds.has(id)))
      errors.push("존재하지 않는 사실 참조");
  for (const [key, axis] of Object.entries(axes)) {
    const items = context.searchMapping[key].items;
    if (
      items.some((x) => !Object.hasOwn(vocabulary.axes[axis].values, x.value))
    )
      errors.push(`허용되지 않은 ${key}`);
    if (new Set(items.map((x) => x.value)).size !== items.length)
      errors.push(`중복 ${key}`);
  }
  for (const a of s.consideredActions)
    if (
      a.actionTag !== null &&
      !Object.hasOwn(vocabulary.axes.action_tag.values, a.actionTag)
    )
      errors.push("허용되지 않은 행동 태그");
  if (errors.length) return { status: "invalid", errors };
  // The server stores the exact snapshot accepted by the user. Corrections invalidate it.
  if (
    !confirmedContext ||
    JSON.stringify(context) !== JSON.stringify(confirmedContext)
  )
    return {
      status: "needs_confirmation",
      reason: "현재 상황과 검색 매핑의 사용자 확인 필요",
    };
  const missing = Object.keys(axes).filter(
    (k) => context.searchMapping[k].status !== "known",
  );
  if (!context.searchMapping.problem_type.items.length)
    missing.push("problem_type");
  if (!context.searchMapping.goal_tags.items.length) missing.push("goal_tags");
  if (!context.searchMapping.urgency.items.length) missing.push("urgency");
  const selected = s.consideredActions.filter(
    (a) => a.status === "confirmed" && approvedActionIds.includes(a.id),
  );
  if (!selected.length) missing.push("actions");
  if (selected.some((a) => a.actionTag === null)) missing.push("action_tag");
  if (missing.length)
    return {
      status: "needs_mapping",
      fields: [...new Set(missing)],
      reason: "미확인·매핑 불가 정보는 임의 태그로 채우지 않음",
    };
  return {
    status: "ready",
    input: {
      category: context.category,
      situation: {
        problem_type: context.searchMapping.problem_type.items.map(
          (x) => x.value,
        ),
        constraint_tags: context.searchMapping.constraint_tags.items.map(
          (x) => x.value,
        ),
        urgency: context.searchMapping.urgency.items[0].value,
        goal_tags: context.searchMapping.goal_tags.items.map((x) => x.value),
      },
      actions: [...new Set(selected.map((a) => a.actionTag))].map(
        (action_tag) => ({ action_tag }),
      ),
    },
  };
}

// Version 2 has undefined intervals; report them rather than silently rounding.
export function mapUrgencyHours(hours) {
  if (hours === null || hours === undefined)
    return { status: "unknown", value: null };
  if (!Number.isFinite(hours) || hours < 0)
    return { status: "unmapped", value: null };
  const value =
    hours < 12
      ? "under_12h"
      : hours >= 24 && hours <= 72
        ? "1_3_days"
        : hours >= 96 && hours <= 168
          ? "4_7_days"
          : hours > 168
            ? "over_1_week"
            : null;
  return { status: value ? "known" : "unmapped", value };
}
