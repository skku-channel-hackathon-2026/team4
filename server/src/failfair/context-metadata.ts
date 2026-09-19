import {
  ContextMetaSchema,
  SITUATION_FIELD_LABELS,
  type FieldEvidence,
  type Message,
  type Situation,
} from "@tutorial/shared";

/** Client review forms do not own evidence. Reconcile only previously stored refs. */
export function preserveContextMeta(
  previous: Situation,
  next: Situation,
  messages: Message[],
): Situation {
  const result = { ...next };
  delete result.contextMeta;
  const parsed = ContextMetaSchema.safeParse(previous.contextMeta);
  if (!parsed.success) return result;
  const validRef = (ref: { messageIndex: number; quote: string }) => {
    const message = messages[ref.messageIndex];
    return (
      !!ref.quote.trim() &&
      message?.role === "student" &&
      message.content.includes(ref.quote)
    );
  };
  const fieldEvidence: FieldEvidence[] = [];
  for (const entry of parsed.data.fieldEvidence ?? []) {
    if (!entry.refs.every(validRef)) continue;
    if ("itemIndex" in entry) {
      const oldValue = previous[entry.field][entry.itemIndex];
      if (oldValue === undefined) continue;
      const indices = next[entry.field].flatMap((value, index) =>
        value === oldValue ? [index] : [],
      );
      if (indices.length === 1)
        fieldEvidence.push({ ...entry, itemIndex: indices[0] });
    } else {
      const before =
        entry.field === "deadline.raw"
          ? previous.deadline.raw
          : previous[entry.field];
      const after =
        entry.field === "deadline.raw" ? next.deadline.raw : next[entry.field];
      if (before !== undefined && before === after)
        fieldEvidence.push(structuredClone(entry));
    }
  }
  const topicStates = (parsed.data.topicStates ?? []).filter((topic) => {
    if (topic.evidence && !topic.evidence.every(validRef)) return false;
    const field = (
      Object.keys(
        SITUATION_FIELD_LABELS,
      ) as (keyof typeof SITUATION_FIELD_LABELS)[]
    ).find((key) => SITUATION_FIELD_LABELS[key] === topic.label);
    if (
      field &&
      JSON.stringify(previous[field]) !== JSON.stringify(next[field])
    )
      return false;
    return topic.status === "known"
      ? !next.unknowns.includes(topic.label)
      : next.unknowns.includes(topic.label);
  });
  result.contextMeta = {
    schemaVersion: "0.3",
    ...(fieldEvidence.length ? { fieldEvidence } : {}),
    ...(topicStates.length
      ? { topicStates: structuredClone(topicStates) }
      : {}),
  };
  return result;
}
