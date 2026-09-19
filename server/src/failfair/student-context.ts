import { preserveContextMeta } from "./context-metadata.js";
import {
  StudentContextSchema,
  type StudentContext,
  type ContextDelta,
  type Message,
} from "@tutorial/shared";

/** Model indices are local; stored evidence indices refer to the whole session. */
export function applyContextDelta(
  previous: StudentContext | undefined,
  delta: ContextDelta,
  recent: Message[],
  offset: number,
): StudentContext {
  const items = new Map(
    (previous?.items ?? []).map((item) => [item.id, structuredClone(item)]),
  );
  const touched = new Set<string>();
  const refs = (evidence: { messageIndex: number; quote: string }[]) =>
    evidence.map((e) => {
      const message = recent[e.messageIndex];
      if (
        message?.role !== "student" ||
        !e.quote.trim() ||
        !message.content.includes(e.quote)
      )
        throw new Error("Invalid context evidence");
      return { ...e, messageIndex: e.messageIndex + offset };
    });
  for (const update of [...delta.upsert, ...delta.remove]) {
    if (touched.has(update.id)) throw new Error("Conflicting context updates");
    touched.add(update.id);
  }
  for (const removal of delta.remove) {
    refs(removal.evidence);
    if (!items.has(removal.id)) throw new Error("Unknown context removal");
    items.delete(removal.id);
  }
  for (const item of delta.upsert) {
    const old = items.get(item.id);
    // An unanswered question must never downgrade a previously established fact/refusal.
    if (old && item.status === "missing" && old.status !== "missing")
      throw new Error("Unsupported context downgrade");
    items.set(item.id, { ...item, evidence: refs(item.evidence) });
  }
  return StudentContextSchema.parse({
    version: "1.0",
    items: [...items.values()],
    askedTopicIds: previous?.askedTopicIds ?? [],
  });
}

export function recordContextQuestion(
  context: StudentContext,
  topicId: string,
): StudentContext {
  const item = context.items.find((item) => item.id === topicId);
  if (!item || item.kind !== "unknown" || item.status !== "missing")
    throw new Error("Invalid question topic");
  if (context.askedTopicIds.includes(topicId))
    throw new Error("Repeated question topic");
  return { ...context, askedTopicIds: [...context.askedTopicIds, topicId] };
}

/** Only actual restrictions become constraints; wishes and hypotheses never do. */
export function projectContext(context: StudentContext) {
  return {
    constraints: context.items
      .filter((i) => i.kind === "constraint")
      .map((i) => `${i.topic}: ${i.value}`),
    goal: context.items
      .filter((i) => i.kind === "goal")
      .map((i) => `${i.topic}: ${i.value}`)
      .join(" / "),
    unknowns: context.items
      .filter((i) => i.kind === "unknown")
      .map((i) => i.topic),
  };
}

/** User edits in the review form must not leave goal/constraint projections stale. */
export function reconcileConfirmedContext(
  previous: import("@tutorial/shared").Situation,
  confirmed: import("@tutorial/shared").Situation,
  messages: Message[],
): import("@tutorial/shared").Situation {
  if (!previous.studentContext)
    return preserveContextMeta(previous, confirmed, messages);
  const context = structuredClone(previous.studentContext);
  const fields = [
    "situation",
    "goal",
    "deadline",
    "progress",
    "constraints",
    "attemptedActions",
    "consideredActions",
  ] as const;
  if (
    !fields.some(
      (field) =>
        JSON.stringify(previous[field]) !== JSON.stringify(confirmed[field]),
    )
  )
    return { ...confirmed, studentContext: context };
  const content = `상황 확인 화면에서 직접 수정한 내용입니다. 이전 내용과 충돌하면 이 내용을 우선합니다.\n상황: ${confirmed.situation}\n목표: ${confirmed.goal}\n마감: ${confirmed.deadline.raw}\n진행: ${confirmed.progress}\n제약:\n${confirmed.constraints.join("\n")}\n해본 행동:\n${confirmed.attemptedActions.join("\n")}\n고려 행동:\n${confirmed.consideredActions.join("\n")}`;
  const messageIndex = messages.length;
  messages.push({ role: "student", content, at: Date.now() });
  for (const kind of ["goal", "constraint"] as const) {
    const changed =
      kind === "goal"
        ? previous.goal !== confirmed.goal
        : JSON.stringify(previous.constraints) !==
          JSON.stringify(confirmed.constraints);
    if (!changed) continue;
    context.items = context.items.filter((item) => item.kind !== kind);
    const values =
      kind === "goal"
        ? confirmed.goal
          ? [confirmed.goal]
          : []
        : confirmed.constraints;
    values.forEach((value, index) => {
      let id = `review_${kind}_${index}`;
      while (context.items.some((item) => item.id === id)) id += "_";
      context.items.push({
        id,
        topic: kind === "goal" ? "원하는 결과" : "확인한 제약",
        kind,
        value,
        status: "stated",
        evidence: [{ messageIndex, quote: value }],
      });
    });
  }
  return { ...confirmed, studentContext: StudentContextSchema.parse(context) };
}
