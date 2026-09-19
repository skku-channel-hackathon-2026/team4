/** Recognize only simple, explicit predicate endings. This is a conservative
 * contradiction check, NOT a synonym dictionary or general language model. */
interface Clause {
  topic: string;
  negative: boolean;
}
function clause(value: string): Clause | undefined {
  if (/[?？]/.test(value)) return undefined;
  const text = value
    .trim()
    .replace(/[.!。]+$/g, "")
    .trim();
  if (!text || /(?:없|않).*(?:않|아니)|(?:다면|라면|경우|가정)/.test(text))
    return undefined;
  const ability =
    /^(.*?)\s*수\s*(없(?:다|음|어요|습니다)|있(?:다|음|어요|습니다))$/.exec(
      text,
    );
  if (ability)
    return { topic: ability[1], negative: ability[2].startsWith("없") };
  const denied =
    /^(.*?)(?:하지는|하지|하진|지는|지|진)\s*않(?:다|음|아요|습니다|는다)$/.exec(
      text,
    );
  if (denied) return { topic: denied[1], negative: true };
  const existence =
    /^(.*?)(없(?:다|음|어요|습니다)|있(?:다|음|어요|습니다)|불가|가능)$/.exec(
      text,
    );
  if (existence)
    return { topic: existence[1], negative: /^(없|불가)/.test(existence[2]) };
  // Unrecognized negatives stay unknown; don't call them affirmative.
  if (/않|없|아니|못|\b안\s/.test(text)) return undefined;
  return {
    topic: text.replace(
      /(?:합니다|했어요|해요|한다|하다|입니다|이에요|이다|어요|아요|다|음|요)$/g,
      "",
    ),
    negative: false,
  };
}
// A copied message is not a second negation. Collapse exact whole-message
// repetitions before inspecting predicate scope, without deleting words inside it.
function uniqueMessage(text: string) {
  const words = text.trim().split(/\s+/);
  for (let size = 1; size <= words.length / 2; size++) {
    if (
      words.length % size === 0 &&
      words.every((word, index) => word === words[index % size])
    )
      return words.slice(0, size).join(" ");
  }
  return text;
}
export function opposingPredicates(
  a: string,
  b: string,
  similarity: (a: string, b: string) => number,
) {
  const clauses = (text: string) =>
    uniqueMessage(text)
      .split(/(?<=[.!?。])\s+|[,;\n]|하지만|지만/)
      .map(clause)
      .filter((c): c is Clause => !!c && c.topic.trim().length >= 2);
  let strongest = 0;
  for (const left of clauses(a))
    for (const right of clauses(b)) {
      if (left.negative === right.negative) continue;
      const overlap = similarity(left.topic, right.topic);
      // Near-identical topics only: a shared noun cannot establish contradiction.
      if (overlap >= 0.75) strongest = Math.max(strongest, overlap);
    }
  return strongest;
}
