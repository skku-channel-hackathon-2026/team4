import {
  ACTION_TAGS,
  PROBLEM_TYPES,
  type Category,
  type Urgency,
} from "./failfair.js";

/**
 * 키워드 기반 추출. 서버의 규칙 게이트웨이와 선배 인터뷰 화면이 같은 규칙을 쓴다.
 * 모델이 붙어도 검증용으로 남는다 (v2 §7).
 */

/** 모호하지 않은 명시적 기간("8시간 남았어요")만 정규화한다. 자유 서술은 건드리지 않는다. */
export function explicitDurationUrgency(text: string): Urgency | undefined {
  const normalized = text.trim();
  const match =
    /^(\d+(?:\.\d+)?)\s*(시간|일|주)\s*(?:후|뒤|이내|안|남(?:았(?:어|어요|다|음)?|음|아(?:요)?)?)?[.!]?$/u.exec(
      normalized,
    );
  if (!match) return undefined;
  const amount = Number(match[1]);
  const hours = amount * ({ 시간: 1, 일: 24, 주: 168 }[match[2]] ?? 1);
  if (!Number.isFinite(hours)) return undefined;
  return hours <= 24 ? "today" : hours <= 168 ? "week" : "later";
}

export function detectUrgency(text: string): Urgency {
  const explicit = explicitDurationUrgency(text);
  if (explicit) return explicit;
  // 서로 어긋나거나 부정·조건이 붙은 기간은 의미 해석이 필요하므로 단정하지 않는다.
  const durations = [
    ...text.matchAll(/(?<![\d.])\d+(?:\.\d+)?\s*(?:시간|일|주)/g),
  ];
  if (durations.length) {
    if (
      durations.length !== 1 ||
      /아니|않|인지|또는|이상|최소|최대|~|에서/.test(text)
    )
      return "unknown";
    return explicitDurationUrgency(durations[0][0]) ?? "unknown";
  }
  if (/오늘|내일|시간 (남|뒤|후)|시간남|몇 시간|자정|당장|지금 바로/.test(text))
    return "today";
  if (/이번 주|일주일|며칠|이틀|사흘|주말|다음 주|3일|4일|5일/.test(text))
    return "week";
  if (/여유|다음 달|한 달|학기|방학|천천히/.test(text)) return "later";
  return "unknown";
}

/** "8시간 남았고" 같은 명시적 표현을 먼저, 없으면 "내일" 같은 단어를 잡는다. */
export function extractDeadlineRaw(text: string): string {
  const explicit = text.match(/\d+\s*(시간|일|주|달)\s*(남|뒤|후|안)[^,.\s]*/);
  if (explicit) return explicit[0];
  const word = text.match(
    /오늘|내일|모레|이번 주|다음 주|주말|이번 달|다음 달|자정/,
  );
  return word?.[0] ?? "";
}

export function detectActionTags(category: Category, text: string): string[] {
  return ACTION_TAGS[category]
    .filter((action) =>
      action.keywords.some((keyword) => text.includes(keyword)),
    )
    .map((action) => action.tag);
}

export function detectActionLabels(category: Category, text: string): string[] {
  return ACTION_TAGS[category]
    .filter((action) =>
      action.keywords.some((keyword) => text.includes(keyword)),
    )
    .map((action) => action.label);
}

export function detectProblemType(
  category: Category,
  text: string,
): string | undefined {
  return PROBLEM_TYPES[category].find((problem) =>
    problem.keywords.some((keyword) => text.includes(keyword)),
  )?.type;
}
