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

## SOS: 새내기 → 실제 선배

사례 상세에서 **실제 경험 + 연락 허용** 사례에만 "이 선배에게 SOS 보내기"가 보인다 (가상 시연 사례, 본인 사례 제외).
선배의 신원은 사례 등록 때 저장한 채널톡 매니저 ID다. 학과·학번은 받지 않는다.

1. 새내기가 한두 줄 메시지로 SOS를 보낸다 → `failfair.sosRequest`. 같은 사례에 대기 중 요청이 있으면 그것을 돌려준다.
2. 앱이 봇(망선박)으로 그 그룹 채팅에 알림을 올린다. 실패해도 요청은 저장되고 `notified=false`로 알려 준다.
3. 선배가 `/망선박 선배` → SOS 요청에서 수락·거절 → `failfair.sosRespond`. 받은 선배만 답할 수 있고 한 번만 바뀐다.
4. 수락하면 같은 방에 봇 알림이 올라가고, 실제 대화는 그 그룹 채팅에서 이어 간다. 앱은 1:1 방을 만들 권한이 없다.

### 알림이 갈 방은 서버가 정한다

SOS는 **그룹 채팅에서 연 경우에만** 보낼 수 있다. 수락한 뒤 두 사람이 이어서 대화할 곳이 그 방뿐이기 때문이다.

`failfair.open`이 호스트에게서 받은 방을 `{channelId, groupId, managerId, chatTitle, expiresAt}`로 서명해 WAM에 `chatToken`으로 내려 주고(`server/src/target-token.ts`),
`sosRequest`는 클라이언트가 보낸 방 ID 대신 이 표식만 믿는다. 서명·채널·호출자 일치·만료를 모두 확인하며(`verifyChatTarget`),
표식이 없거나 맞지 않으면 `CHAT_TARGET_REQUIRED`로 거절한다. 그룹이 아닌 방에서는 표식이 발급되지 않아 같은 곳에서 막힌다.
화면은 이때 "그룹 채팅방에서 열어 주세요"로 안내한다.

요청은 시작된 방의 이름(`chatTitle`)을 함께 지니고 다닌다. 선배 수신함은 채널 전체를 보여 주므로 다른 방에서 온 요청도 보이는데,
그때 어느 방으로 가야 하는지를 이 이름으로 알린다. 새내기 화면도 기존 요청이 다른 방에서 시작됐으면 "이 채팅방" 대신 그 방을 가리킨다.

### 저장은 요청마다 한 행

`app_records`에 `failfair:sos:{채널}:{사례}:{새내기}` 한 자리당 한 행이다. 전체 목록을 한 키에 배열로 두면
"읽고 → 고치고 → 통째로 덮어쓰는" 사이에 남의 요청이나 이미 끝난 수락이 사라진다 (실제로 재현됐다).

- 새 요청: `INSERT ... ON CONFLICT DO NOTHING`. 자리를 차지한 쪽만 `created=true`가 되어, 중복 방지를 DB가 보장한다. 거절당한 자리는 새 요청이 대신한다.
- 수락·거절: `UPDATE ... WHERE json_extract(value_json, '$.status') = 'pending'`. 실제로 바뀐 쪽만 `changed=true`가 되고 봇 알림도 그때만 나간다.
- 진 쪽은 저장된 최신 상태를 돌려받아, 화면이 자기가 누른 답을 잘못 보여 주지 않는다.

봇 알림은 `writeGroupMessage` 권한이 있는 그룹에서만 된다. 실패해도 요청은 남고, 선배가 앱을 열면 보인다.

## 아직 없는 것

- 실제 모델 연결. `MODEL_PROVIDER`, `MODEL_API_KEY`가 없으면 규칙 기반으로 동작한다. 키는 운영진이 Workers 비밀 변수로 넣어야 한다.
- D1 전용 테이블. `0002_failfair.sql`은 제안이며 코드가 아직 쓰지 않는다. 원격 적용은 운영진 요청 후.
- 세션 만료·삭제, 대화 원문 보관 정책.
- 일반 학생용 공개 진입점. 지금은 Desk 계정으로만 연다.

## 실행과 검사

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm dev:wam            # 화면만, 가짜 bridge (wam/src/devBridge.ts). ?mode=senior 로 선배 화면
corepack pnpm dev:wam:server     # 화면 + 로컬 Worker. 아래 dev:cloudflare 를 먼저 띄운다. 실제 서버·Gemini 대화 (주소에 ?bridge=server 도 됨)
corepack pnpm build:cloudflare && corepack pnpm dev:cloudflare   # 서버 + D1
corepack pnpm typecheck && corepack pnpm test && corepack pnpm lint && corepack pnpm format:check
```

main 머지 전에 마지막 줄이 전부 통과해야 CI가 배포한다.

## 운영진에게 요청할 것

1. 커맨드 등록 갱신. `/tutorial` → `/failfair` (표시명 망선박). 갱신 전에도 `/tutorial`은 새 화면을 연다.
2. (모델 연결 시) `MODEL_PROVIDER`, `MODEL_API_KEY` 비밀 변수.
3. (D1 이전 시) `0002_failfair.sql` 원격 적용.
