# 상황 JSON 0.2 — ji_heon 검색 예시 연결

기준: ji_heon a0c14e9d08a9cd4ddaeb988c1822cd3106901f02, vocab version 2.
기존 facts/constraints/interpretations와 사용자 인용은 유지한다. Q.E.D.와 무관한 독립 계약 모듈이며 서버·Channel Talk 연결은 아직 하지 않았다.

## 변경

- schemaVersion: 0.1-draft → 0.2-draft.
- searchMapping 추가: problem_type, constraint_tags, urgency, goal_tags 각각 status와 items를 가진다. 각 태그에 사용자 원문 evidence를 붙인다.
- status: known / unknown / unsure / withheld / unmapped. known+빈 constraint_tags는 확인된 제약 없음이며 unknown과 다르다.
- consideredActions에 actionTag와 confirmationEvidence 추가. 태그 매핑 불가는 null이다.
- 사용자 행동은 발언 근거, confirmed/rejected 행동은 확인 근거를 필수로 한다.
- attemptedActions가 unknown/unsure/withheld면 items는 비어 있어야 한다.
- buildSearchInput은 JSON Schema, 허용 어휘, 사용자 원문 인용, ID 중복과 사실 참조를 검사한다.
- 모델이 confirmed를 쓰는 것만으로 검색할 수 없다. 서버가 보관한 사용자 확인 snapshot과 approvedActionIds를 함께 검사한다. 이 두 값은 클라이언트나 모델 출력에서 신뢰해서 가져오면 안 된다.

## 사용

code 디렉터리에서 `npm ci` 후 `npm test`.

```js
import { buildSearchInput } from "./pipeline.mjs";
const result = buildSearchInput(context, {
  messages: storedUserMessages,
  confirmedContext: session.confirmedContext,
  approvedActionIds: session.approvedActionIds,
});
if (result.status === "ready") {
  // result.input을 사례 검색 서비스로 전달
}
```

ready.input은 golden 예시와 같은 category / situation / actions 형식이다. expect_*는 테스트 기대값이므로 요청에 포함하지 않는다. 같은 태그의 확인된 행동은 한 번만 검색한다. 원래 context는 별도로 보존해 검색 후 conditions/receipt와 비교한다.

## 파일

- situation.empty.json: 초기 상태
- situation.example.json: 기존 21학점·알바 예시. 모르는 태그는 비워 둔 상태
- situation.search-ready.example.json: grades 골든 예시의 첫 검색 입력에 맞춘 가상 확인 완료 상황
- messages.search-ready.example.json: 위 예시의 가상 사용자 발언
- search-input.example.json: 변환 결과
- reference/vocab.json: 기준 브랜치의 어휘 스냅샷
- reference/grades.golden.json: 기준 브랜치의 검증 예시 원문
- pipeline.mjs / pipeline.test.mjs: 변환·검증과 테스트

## 미확인 정보와 경계

현재 golden 형식에는 미확인 긴급도 표현이 없다. unknown/unsure/withheld/unmapped 축이 있으면 needs_mapping을 반환한다. 질문을 거부한 사용자에게 같은 질문을 반복하라는 뜻이 아니다. UI에서 진행 제한을 알리거나 B와 별도의 부분 검색 계약을 정해야 한다. 태그를 임의 생성하지 않는다.

mapUrgencyHours는 실수 시간 단위 입력을 받는다. [0,12), [24,72], [96,168], (168,∞)만 매핑하며 나머지는 unmapped다. 12~~24시간, 72~~96시간 구간은 기존 어휘의 설명만으로 결정하지 않는다. 팀 합의 후 vocab과 테스트를 함께 변경한다. 기한 경과는 음수로 입력해 unmapped로 남긴다.

인용 문자열이 실제 메시지에 존재하는지와 그 인용이 태그 의미를 정말 뒷받침하는지는 별개다. 의미 타당성은 모델 평가와 사용자 확인이 필요하다. 이 모듈은 자연어 이해 모델이나 질문 생성기를 구현한 것이 아니다.

상황 정정 시 확인 snapshot과 행동 승인을 서버에서 무효화해야 한다. 기존 0.1 데이터를 0.2로 옮길 때 searchMapping은 unknown, actionTag는 null, 행동 승인은 재확인으로 초기화한다.

## 검증 범위

11개 테스트: 검색 예시 일치, 기존 맥락의 미확인 처리, 사용자 확인 누락, 정정 후 이전 확인 무효화, 서버 행동 승인, 어휘 오류, 잘못된 인용, 확인 근거 누락, 시도 상태 모순, ID 참조, 긴급도 경계.
실제 LLM 추출, 사례 검색 순위, DB 및 Channel Talk 종단간 연결은 이 모듈의 검증 범위 밖이다.

## PR 검토 보완

openQuestions 상태에 asked를 추가한다. analyzeTurn이 선택한 질문을 asked로 반환하고 이전 질문 이력을 보존한다. 기존 confirmed/rejected 행동·해석은 삭제·강등도 금지한다. 현재 수정은 0.2-draft 계약의 팀 합의 전 보완이며 다른 클라이언트도 새 상태를 처리해야 한다.
