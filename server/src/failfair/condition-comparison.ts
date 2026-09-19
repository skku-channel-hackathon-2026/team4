/** Conservative comparisons of explicit restrictions, not an entailment model.
 * Only identical named quantities or identical subjects with explicit
 * 있음/없음·가능/불가 are comparable. Unparsed free text stays unknown. */
export interface ConditionComparison {
  comparable: number;
  differences: string[];
}
const clean = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[.,!?。]+$/g, "");
function quantity(text: string) {
  const normalized = clean(text);
  const match = /^(.*?)(\d+(?:\.\d+)?)(학점|명|시간|분|원|일|주)(.*)$/.exec(
    normalized,
  );
  if (match) {
    const [, before, number, unit, after] = match;
    return {
      key: `${before}:${unit === "시간" || unit === "분" ? "분" : unit}:${after}`,
      value: Number(number) * (unit === "시간" ? 60 : 1),
    };
  }
  const grade = /^(평점|GPA|gpa)(\d+(?:\.\d+)?)$/.exec(normalized);
  return grade ? { key: "평점", value: Number(grade[2]) } : undefined;
}
function polarity(text: string) {
  const match = /^(.*?)(있음|없음|가능|불가)$/.exec(clean(text));
  if (!match || !match[1]) return undefined;
  return { key: match[1], value: ["있음", "가능"].includes(match[2]) };
}
export function compareConditions(
  student: string[],
  senior: string[],
): ConditionComparison {
  let comparable = 0;
  const differences: string[] = [];
  for (const text of new Set(student)) {
    for (const own of new Set(senior)) {
      const a = quantity(text),
        b = quantity(own);
      const pa = polarity(text),
        pb = polarity(own);
      const numeric = a && b && a.key === b.key;
      const polar = pa && pb && pa.key === pb.key;
      if (!numeric && !polar) continue;
      comparable++;
      if ((numeric && a.value !== b.value) || (polar && pa.value !== pb.value))
        differences.push(
          `주요 제약 차이: 학생 «${text}» / 선배 «${own}». 적용 가능성 확인 필요`,
        );
    }
  }
  return { comparable, differences: [...new Set(differences)] };
}
