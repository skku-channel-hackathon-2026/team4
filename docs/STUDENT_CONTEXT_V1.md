# 학생 맥락 구조 v1.0

## 목적

JSON 키를 대화마다 임의로 늘리는 대신, 고정된 계약 안의 `items` 배열을 확장한다. 새 주제는 새로운 항목으로, 같은 주제의 정정은 같은 id의 교체로 표현한다. 특정 시연 대본을 프롬프트나 목표 응답으로 추가하지 않았다.

```text
학생 발화 + 기존 항목 + 대화 이력
  → Gemini: 유형별 항목 변경분(contextDelta) + 호환용 요약 + 질문 주제
  → 서버: 상태/근거/정정/반복 질문 검증 및 병합
  → studentContext 저장
  → 기존 goal / constraints / unknowns로 투영
  → 상황 확인 → 기존 행동·사례 검색
```

## 정보 종류

| kind       | 뜻                                          | status                      |
| ---------- | ------------------------------------------- | --------------------------- |
| fact       | 명시된 사실. 부정문도 부정 의미 그대로 보존 | stated                      |
| goal       | 달성하려는 목표                             | stated                      |
| preference | 유지하거나 선택하고 싶은 것                 | stated                      |
| constraint | 실제로 행동을 제한하는 조건                 | stated                      |
| hypothesis | 시스템의 추정. 사실로 전달하지 않음         | inferred                    |
| unknown    | 아직 확보하지 못한 정보                     | missing / unsure / withheld |

`missing`은 정보가 없다는 뜻이다. 질문 여부는 `askedTopicIds`로 따로 기록한다. `unsure`는 학생이 명시적으로 모른다고 한 경우, `withheld`는 공개를 거부한 경우이며 인용이 필수다. 질문과 다른 답변을 했다는 이유로 모름으로 바꾸면 안 된다.

## 저장 예시

학생: “사진 모임은 계속 나가고 싶고, 야간 근무는 계약 때문에 바꿀 수 없어.”

```json
{
  "version": "1.0",
  "items": [
    {
      "id": "photo_meeting",
      "topic": "사진 모임",
      "kind": "preference",
      "value": "사진 모임 유지 희망",
      "status": "stated",
      "evidence": [
        { "messageIndex": 0, "quote": "사진 모임은 계속 나가고 싶고" }
      ]
    },
    {
      "id": "work_schedule",
      "topic": "근무 일정",
      "kind": "constraint",
      "value": "계약 때문에 야간 근무 변경 불가",
      "status": "stated",
      "evidence": [
        { "messageIndex": 0, "quote": "야간 근무는 계약 때문에 바꿀 수 없어" }
      ]
    },
    {
      "id": "available_time",
      "topic": "이용 가능한 시간",
      "kind": "unknown",
      "value": "",
      "status": "missing",
      "evidence": []
    }
  ],
  "askedTopicIds": []
}
```

저장 위치는 기존 Situation의 `studentContext`다. `contextMeta` v0.3과 달리 유형별 내용 자체를 보존한다.

## 추가와 정정

Gemini는 `{ "contextDelta": { "upsert": [...], "remove": [...] }, "nextQuestionTopic": "..." }`를 기존 응답과 함께 반환한다.

- 처음 나온 정보: 새 id로 upsert.
- 같은 주제의 정정: 기존 id로 upsert. 변경하지 않은 다른 항목은 서버가 보존.
- 철회: remove에 id와 학생 인용을 포함. 빈 응답을 철회로 해석하지 않음.
- 같은 id를 한 응답에서 두 번 수정하거나 수정·삭제를 동시에 하면 거부.
- 새 evidence는 최근 메시지 배열의 인덱스, 저장 시 전체 세션 인덱스로 변환.
- 질문은 missing 항목의 id로 지정. 한 번 물은 id는 문구가 달라도 재질문을 거부하고 교정을 요청.
- 한 항목에는 독립적으로 정정 가능한 한 가지 내용을 담도록 지시. 정정 후 모순 검토를 요구.

## 기존 시스템과 연결

- `goal`은 goal 항목, `constraints`는 constraint 항목, `unknowns`는 unknown 항목에서 서버가 만든다. 값이 “변경 불가”처럼 짧아도 의미가 사라지지 않도록 목표·제약에는 topic도 함께 붙인다.
- preference와 hypothesis는 constraints에 넣지 않는다. 사실 요약·기한·진행·행동은 기존 출력도 함께 사용한다. 모든 legacy 필드가 결정적 투영으로 바뀐 것은 아니다.
- `toLegacySituation`은 studentContext와 contextMeta를 제거해 기존 전달 형식을 유지한다.
- 새 구조에서는 기존 contextMeta를 중복 저장하지 않는다. 이전 세션·이전 형식 응답은 호환 경로를 유지하지만, 이미 새 구조로 시작한 세션에서 contextDelta 누락은 실패 처리한다.
- 확인 화면은 선호를 별도 표시하고 새 구조를 보존한다. 사용자가 목표·제약을 수정하면 구조에도 반영하고 수정 내용을 학생 메시지로 기록한다. 다른 필드 수정도 대화 이력에 남겨 다음 분석에서 우선 반영한다.
- 확장 상태가 있는 세션에서 Gemini가 실패하면 규칙 기반 분석기로 몰래 변경하지 않고 재시도 오류를 반환한다. 기존 세션/초기 실패의 규칙 기반 대체 정책은 유지한다.
- 행동 후보 생성 및 사례 검색 알고리즘은 이번 구조 변경 대상이 아니다.

## 검증과 한계

- 서버 자동 테스트 89개 통과. 분류 투영, 인용, 업데이트 보존, 정정, 삭제, 반복 질문, 저장 왕복, 확인 화면 수정, 실패 시 상태 보존 포함.
- 타입 검사·Cloudflare 빌드·포맷 검사 수행.
- 시연 대본과 다른 세 대화, 총 다섯 턴을 실제 Gemini에 입력해 점검. 개발용 검사 실행: `cd server && node --import tsx src/failfair/evaluation/live.ts --context`.
- 초기 구조 평가에서 자동 검사 3/3 통과했지만 수동 검토로 정정 전 사실이 남는 문제 발견. 자동 PASS를 의미 정확도 100%로 해석하지 않음. 이를 반영해 원자적인 항목 분리와 정정 후 모순 검토 규칙을 추가.
- 정확한 인용이 있어도 의미 해석 자체를 서버가 수학적으로 검증할 수는 없다. 같은 주제를 다른 id로 생성하거나 복합 사실 정정에 실패할 가능성이 남는다.
- 기존 legacy 세션의 정보는 최근 대화에서 근거를 확인할 수 있는 것부터 새 구조로 추출한다. 긴 과거 대화 전체에 대한 자동 데이터 이관 기능은 아니다.
- 범용 자연어 이해 모델의 재학습이 아니며, 세 가지 지원 카테고리 내의 정보 표현·검증 구조 개선이다. category는 사용자가 선택한 값을 유지한다.

## 수정 위치

- `packages/shared/src/student-context.ts`: 계약·상태 조합 검증
- `server/src/failfair/student-context.ts`: 변경분 병합·투영·질문 이력·사용자 확인 반영
- `server/src/failfair/gemini.gateway.ts`: Gemini 응답 스키마·프롬프트·검증 연결
- `server/src/failfair/session.service.ts`, `functions.ts`: 저장/확인 흐름
- `wam/src/pages/Failfair/SituationReview.tsx`: 선호 표시 및 구조 보존
- `server/src/failfair/evaluation/context-scenarios.ts`: 시연 대본과 별도인 개발 평가

## 최종 실측 결과 및 미해결 사항

최종 실행 파일: 로컬 `server/evaluation-results/gemini-1789805933943.json`.

- 실행 당시 자동 검사 세 시나리오/다섯 턴 통과. 선호와 제약 분리, 부정한 제약 미생성, 질문에 답하지 않은 경우 missing 보존 확인.
- 수동 검토에서는 정정 시 “발표 준비” 항목을 남긴 채 “보고서 제출” 항목을 추가하는 오류가 여전히 발견됨. 따라서 의미 정확성 기준으로는 세 시나리오 중 두 개만 만족한 것으로 판단한다.
- 해당 누락을 잡도록 개발 평가에 이전 사실 잔존 검사도 추가했다. 런타임에 그 표현을 위한 예외 규칙을 넣지는 않았다. 이 판정은 저장된 응답 재검토 결과이며, 수정된 검사로 추가 API 호출은 하지 않았다.
- 구조적 병합은 같은 id의 정정을 안전하게 처리하지만, 모델이 같은 주제를 다른 id로 출력하는 의미 판단까지 보장하지 못한다. 다음 개선은 별도 의미 충돌 검증 단계 또는 사용자에게 충돌 항목 확인을 요청하는 흐름이다.
- 초기 검증 시점은 로컬 구현이었다. 이후 PR #14 리뷰를 반영한 재반영 범위와 최신 검증은 [PR14_REVIEW_RESOLUTION.md](PR14_REVIEW_RESOLUTION.md)를 참고한다.
