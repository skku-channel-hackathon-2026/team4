# 망한 선배 박람회 — 구현 현황과 인계

설계 원문: 노션 「망선박 v2」. 이 문서는 저장소에 실제로 있는 것과 없는 것을 적는다.

## 지금 동작하는 것

두 흐름의 뼈대가 서버·화면·테스트까지 붙어 있다.

**학생 흐름** `/망선박` → 카테고리 선택 → 자유 입력 대화 (규칙 기반 추가 질문 최대 3개) → 상황 확인·수정 → 행동 후보 확인 (내가 말한 행동 + 제안, 직접 추가 가능) → 행동별 선배 사례 비교 카드 → 사례 상세·도구 복사 → 도움 됨.

**선배 흐름** `/망선박 선배` → 사례 입력 폼 (상황, 행동 순서 + 태그, 결과, 복구 영수증, 조건, 키워드, 도구) → `draft` 저장 → 검수 화면에서 승인·숨김. 승인된 사례만 학생 결과에 나온다.

세션은 소유자(채널 + 매니저)만 읽을 수 있고, 변경 요청은 `requestId`로 중복 재생, `expectedRevision`으로 오래된 버전을 거절한다. 시연 사례 5개는 전부 `sourceType: "demo"`로 표시된다.

## 파일과 담당 (v2 §11)

| 담당        | 파일                                                                                                                                                                       | 현재 상태                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A 프런트    | `wam/src/pages/Failfair/*`, `wam/src/pages/Senior/*`, `wam/src/components/failfair/*`, `wam/src/hooks/useFailfair*.ts`, `wam/src/index.css`                                | 6단계 화면 전부 있음. 다듬기·모바일 폭·오류 상태 보강                               |
| B 백엔드    | `packages/shared/src/failfair.ts`, `server/src/failfair/functions.ts`, `session.service.ts`, `case.repository.ts`, `records.ts`, `cloudflare/migrations/0002_failfair.sql` | Function 12개 동작. 저장은 `app_records` JSON. D1 테이블로 이전은 제안 상태         |
| C 대화·검색 | `server/src/failfair/model-gateway.ts`, `retrieval.service.ts`                                                                                                             | 규칙 기반 게이트웨이와 점수 매칭. LLM 게이트웨이는 `createModelGateway`에 끼우면 됨 |
| D 콘텐츠·QA | `packages/shared/src/cases.ts`, `docs/`, `scripts/smoke-*.mjs`                                                                                                             | 가상 사례 5개. 실제 사례는 선배 입력 화면으로 등록 후 승인                          |

## 아직 없는 것

- 실제 모델 연결. `MODEL_PROVIDER`, `MODEL_API_KEY`가 없으면 규칙 기반으로 동작한다. 키는 운영진이 Workers 비밀 변수로 넣어야 한다.
- D1 전용 테이블. `0002_failfair.sql`은 제안이며 코드가 아직 쓰지 않는다. 원격 적용은 운영진 요청 후.
- 세션 만료·삭제, 대화 원문 보관 정책.
- 일반 학생용 공개 진입점. 지금은 Desk 계정으로만 연다.

## 실행과 검사

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm dev:wam            # 화면만, 가짜 bridge (wam/src/devBridge.ts). ?mode=senior 로 선배 화면
corepack pnpm build:cloudflare && corepack pnpm dev:cloudflare   # 서버 + D1
corepack pnpm typecheck && corepack pnpm test && corepack pnpm lint && corepack pnpm format:check
```

main 머지 전에 마지막 줄이 전부 통과해야 CI가 배포한다.

## 운영진에게 요청할 것

1. 커맨드 등록 갱신. `/tutorial` → `/failfair` (표시명 망선박). 갱신 전에도 `/tutorial`은 새 화면을 연다.
2. (모델 연결 시) `MODEL_PROVIDER`, `MODEL_API_KEY` 비밀 변수.
3. (D1 이전 시) `0002_failfair.sql` 원격 적용.
