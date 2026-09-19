# Gemini 3.1 Flash-Lite 서버 연결

`createModelGateway()`가 `MODEL_PROVIDER=gemini`일 때 실제 서버의 `GeminiGateway`를 선택한다. 기존 failfair.reply → ModelGateway.analyze → 상황 검토 흐름과 연결되며 UI/API/D1 스키마 변경은 없다.

## 설정

로컬 Node 서버는 server/.env, 로컬 Workers는 루트 .dev.vars에 다음 값을 설정한다.

```dotenv
MODEL_PROVIDER=gemini
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_API_KEY=사용자_API_키
```

원격 Workers의 키 및 환경변수 설정은 HACKATHON.ko.md에 따라 운영진에게 요청한다. 키를 코드나 PR에 올리지 않는다. 설정하지 않으면 기존 규칙 기반 동작을 유지한다. gemini를 선택했는데 키가 없거나 값이 잘못되면 throw하지 않고 경고 로그를 남긴 뒤 규칙 기반으로 기동한다(부팅 실패로 Worker 전체가 500이 되는 것을 막기 위해서다). 실제로 무엇이 기동됐는지는 `GET /api/health`의 `model` 필드(`gemini` 또는 `rule`)와, 내려앉은 경우 `modelWarning`으로 확인한다. 운영진에게 요청할 때는 `GEMINI_API_KEY`를 먼저 넣고 `MODEL_PROVIDER=gemini`를 나중에 넣는다.

## 처리 및 검증

- 최근 대화 16개와 현재 상황을 JSON 모드로 전달한다. 이미 저장된 최신 메시지는 중복 전송하지 않는다.
- 20초 제한 및 출력 토큰 상한을 적용한다. 차단·잘림·HTTP 오류·잘못된 JSON은 실패로 처리하며 모델의 오류 원문/키를 노출하지 않는다.
- Zod로 상황과 다음 질문을 검사하고 카테고리 및 problemType 허용값을 확인한다.
- 변경된 비어 있지 않은 필드에 사용자 발언 인용을 요구한다. 인용 문자열의 실제 존재를 확인하지만 의미적 타당성을 보장하지는 않는다.
- 질문 최대 3회, 거부 필드 및 동일 질문 반복 차단. 새로운 표현의 의미 중복은 프롬프트 수준의 제한이다.
- 분석 실패 시 `GeminiGateway`는 입력 상황을 변경하지 않고 오류를 던진다. 서버는 이를 `FallbackGateway`로 감싸 그 턴만 규칙 기반 게이트웨이로 답하고 경고 로그를 남기므로 학생에게 오류가 보이지 않는다. 세션 저장은 기존 mutate 흐름의 성공 단계에서만 수행한다.
- 행동 후보 생성은 기존 RuleBasedGateway의 카탈로그를 사용한다. AI 행동 추천까지 연결한 것은 아니다.

## 초안 JSON과의 관계

proposals/context-contract의 근거·해석 중심 0.2 JSON은 독립 제안이다. 실제 main 서버는 SituationSchema와 today/week/later/unknown 긴급도를 사용하므로 이 어댑터는 그 계약에 맞춰 구현했다. 원래 초안 JSON 전체나 evidence를 D1에 저장하지 않는다. 추후 팀 합의에 따라 공유 계약과 저장 구조를 확장해야 한다. ji_heon의 긴급도 태그를 main의 계약에 그대로 혼합하지 않는다.

## 검증

서버 테스트 21개 통과, pnpm typecheck 및 pnpm build:cloudflare 통과. 외부 API 응답은 모의 처리했으며 실제 Gemini 대화 실행 결과는 [conversation-testing.md](conversation-testing.md)에 기록했다. 채널톡 종단간 검증은 아직 수행하지 않았다.
