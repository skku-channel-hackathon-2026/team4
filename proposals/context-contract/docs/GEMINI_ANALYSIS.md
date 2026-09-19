# Gemini 대화 분석 — 다음 구현 단계

모델: `gemini-3.1-flash-lite`. 사용자가 Flash-Lite 선택을 확인했다.

## 제공하는 것

- `code/analyze-turn.mjs`: 현재 상황 + 저장된 대화 + 새 사용자 메시지를 받아 갱신된 context와 질문 한 개 또는 요약 확인 응답을 반환한다.
- `code/gemini-gateway.mjs`: 서버에서 Gemini REST generateContent 호출. API 키는 헤더로만 전달하며 URL에 포함하지 않는다. 20초 제한, JSON 모드, 비정상 종료·HTTP 오류 처리를 포함한다.
- `code/demo-gemini.mjs`: 제공된 가상 학생 예시 한 건의 실제 모델 호출용 실행 파일.
- 기존 `pipeline.mjs`: 스키마·근거·태그 검증과 확인된 상황의 검색 입력 변환.

## 로컬 실행

Node.js 24 이상, code 폴더에서:

```sh
npm ci
cp .env.example .env
# 로컬 편집기로 .env의 GEMINI_API_KEY를 설정
npm test
npm run demo:gemini
```

키를 채팅이나 Git에 올리지 않는다. `.env`는 제외되어 있다. 모델명은 GEMINI_MODEL로 교체할 수 있다.
데모는 가상 입력을 Google Gemini API로 보내며 API 사용료가 발생할 수 있다. 이번 작업에서 실제 API 호출은 하지 않았다.

## 서버 호출 계약

```js
const result = await analyzeTurn({ context, messages, message }, gateway);
```

messages는 현재 세션의 기존 메시지, message는 아직 반영하지 않은 새 메시지다. 각 메시지는 id/role/text를 가진다. id 중복은 거부한다.
`status=ok`이면 context/reply/kind/nextQuestionId/invalidateConfirmation을 받는다.
`status=retry`이면 기존 context를 그대로 반환한다. 잘못된 JSON, 없는 원문 인용, 잘못된 태그, 모델이 생성한 승인 상태, 기존 거부 질문의 재질문 등을 거부한다.

최근 메시지 12개와 기존 context의 인용 근거 메시지만 모델에 보낸다. 입력 크기 제한을 넘으면 context_limit으로 반환하며 조용히 근거를 삭제하지 않는다. 원문 인용 검증은 서버에 저장된 전체 세션 메시지를 사용한다.

B가 해야 할 통합:

1. 세션 소유권 확인과 메시지 ID/revision/requestId 관리.
2. 모델 호출 후 expectedRevision 재검사, 성공 시 메시지와 context를 함께 저장.
3. 성공 결과는 기존 상황 확인과 행동 승인을 무효화한다.
4. 사용자가 실제 확인한 이벤트에서 confirmedContext와 approvedActionIds를 저장.
5. 이후 buildSearchInput 호출, ready일 때만 검색 서비스로 전달.

## 한계와 다음 검증

- 기존 서버 엔드포인트, D1, WAM, Channel Talk에는 아직 연결하지 않은 독립 모듈이다.
- Gemini에는 JSON 모드와 상황 스키마 지침을 전달하고, 반환 후 Ajv로 조건부 스키마를 검증한다. 공급자가 모든 조건을 강제하는 structured schema 방식은 아니다.
- 모의 응답 기반 테스트 20개 통과. 실제 Gemini 호출 성공 및 자연어 추출 품질은 API 키 설정 후 확인해야 한다.
- 문자 그대로 인용이 존재해도 태그 의미가 정확하다는 보장은 없다. 기존 A/B/C 가상 입력과 정정/거부 대화로 품질 평가가 필요하다.
- 질문의 의미 중복은 동일 ID/topic/question에 대한 코드 검사와 프롬프트로 완화한다. 표현만 바꾼 모든 중복을 탐지하는 의미 평가기는 아직 없다.
- API 호출은 재시도하지 않는다. 실패 시 기존 상태를 유지하고 사용자 재시도로 진행한다.

## 공식 문서

- https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite
- https://ai.google.dev/gemini-api/docs/generate-content/structured-output
