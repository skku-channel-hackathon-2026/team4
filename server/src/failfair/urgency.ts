import type { Urgency } from "@tutorial/shared";

/** Only normalize unambiguous explicit durations, not arbitrary user prose. */
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
