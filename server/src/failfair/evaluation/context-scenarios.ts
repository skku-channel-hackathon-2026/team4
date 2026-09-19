import type { Scenario } from "./conversation.js";

// Structural/semantic smoke checks, not a benchmark of general understanding.
// No demo-script assistant answers or target summaries are supplied to the model.
export const contextScenarios: Scenario[] = [
  {
    id: "context-preference-versus-restriction",
    category: "club",
    turns: [
      {
        message:
          "전시회 준비 때문에 힘들어. 사진 모임은 계속 나가고 싶고, 야간 근무는 계약 때문에 바꿀 수 없어. 전시회 맡은 일을 줄이고 싶어.",
        check: (o) => {
          const items = o.situation.studentContext?.items ?? [];
          return [
            ...(!items.some(
              (i) =>
                i.kind === "preference" &&
                /사진|모임/.test(`${i.topic} ${i.value}`),
            )
              ? ["모임 유지 선호 누락"]
              : []),
            ...(!items.some(
              (i) =>
                i.kind === "constraint" &&
                /근무|계약/.test(`${i.topic} ${i.value}`),
            )
              ? ["근무 제약 누락"]
              : []),
            ...(items.some(
              (i) =>
                i.kind === "constraint" && /사진/.test(`${i.topic} ${i.value}`),
            )
              ? ["사진 모임 선호를 제약으로 승격"]
              : []),
          ];
        },
      },
      {
        message:
          "사진 모임은 이번 달 쉬기로 바꿨어. 근무 계약은 그대로야. 지금 정보로 정리해줘.",
        check: (o) => {
          const items = o.situation.studentContext?.items ?? [];
          return items.some(
            (i) =>
              i.kind === "constraint" &&
              /근무|계약/.test(`${i.topic} ${i.value}`),
          )
            ? []
            : ["정정과 무관한 제약 손실"];
        },
      },
    ],
  },
  {
    id: "context-unanswered-is-not-unsure",
    category: "team_project",
    turns: [
      {
        message:
          "팀 발표 준비 중인데 자료가 서로 달라. 누구 잘못인지는 아직 모르겠어. 먼저 자료 기준을 통일하고 싶어.",
      },
      {
        message: "아, 발표가 아니라 보고서 제출이야. 지금 정보로 정리해줘.",
        check: (o) => {
          const items = o.situation.studentContext?.items ?? [];
          const stale = items.some(
            (i) =>
              i.kind === "fact" &&
              /발표.*준비/.test(i.value) &&
              !/아니|취소|변경|정정/.test(i.value),
          );
          return [
            ...(stale ? ["정정 이전의 발표 준비 사실이 남아 있음"] : []),
            ...items
              .filter(
                (i) =>
                  (i.status === "unsure" || i.status === "withheld") &&
                  i.evidence.some((e) => e.quote.includes("보고서")),
              )
              .map(() => "단순 정정을 모름·거부 근거로 사용"),
          ];
        },
      },
    ],
  },
  {
    id: "context-negative-background",
    category: "grades",
    turns: [
      {
        message:
          "통학 시간은 문제없어. 장학금을 받으려면 평균을 올려야 해. 하지만 실험 보고서 작성법을 몰라서 막혀 있어. 온라인 강의를 먼저 찾아보고 싶어.",
        check: (o) => {
          const items = o.situation.studentContext?.items ?? [];
          return [
            ...(!o.situation.studentContext ? ["확장 맥락 누락"] : []),
            ...(items.some(
              (i) =>
                i.kind === "constraint" && /통학/.test(`${i.topic} ${i.value}`),
            )
              ? ["부정한 통학 제약을 저장"]
              : []),
            ...(!items.some((i) => i.kind === "goal") ? ["목표 누락"] : []),
          ];
        },
      },
    ],
  },
];
