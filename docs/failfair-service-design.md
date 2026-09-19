# 망한 선배 박람회 — 구현 현황과 인계

설계 원문: 노션 「망선박 v2」. 이 문서는 저장소에 실제로 있는 것과 없는 것을 적는다.

## 지금 동작하는 것

두 흐름의 뼈대가 서버·화면·테스트까지 붙어 있다.

**학생 흐름** `/망선박` → 카테고리 선택 → 한 대화 안에서: 자유 입력 (규칙 기반 추가 질문 최대 3개, 질문은 방금 말한 것을 받아 준 뒤 하나만 묻는다) → 서버의 정리 말풍선 아래 「맞아요」로 확정 (다르면 그냥 이어서 말하면 재분석, 항목별로 고치려면 「직접 고칠게요」 폼) → 행동 후보를 칩으로 골라 비교 (내가 말한 행동 + 제안, 직접 추가 가능) → 행동별 선배 사례 비교 카드 → 사례 상세·도구 복사 → 도움 됨. 확인·선택 단계는 별도 화면이 아니라 대화 로그 안의 말풍선이다 (`wam/src/pages/Failfair/Chat.tsx`, `components/failfair/ActionPicker.tsx`).

**선배 흐름** `/망선박 선배` → 카테고리 선택 → 인터뷰 (봇이 "무슨 일이 있었나 → 뭘 했나 → 어떻게 됐나 → 뭘 잃었나 → 다음 사람에게 남길 조건·도구" 순으로 하나씩 묻고, 문제 유형·행동 태그·상태·SOS 허용은 칩으로 답한다. 제목은 상황 첫 문장, 첫 행동은 행동 1번에서 만든다) → 정리 카드 미리보기 (제목 수정, 항목별 「고치기」) → `draft` 저장 → 검수 화면에서 승인·숨김. 승인된 사례만 학생 결과에 나온다. 대본은 `wam/src/utils/seniorInterview.ts`, 키워드 추정은 `packages/shared/src/detect.ts` (서버 규칙 게이트웨이와 같은 함수).

세션은 소유자(채널 + 매니저)만 읽을 수 있고, 변경 요청은 `requestId`로 중복 재생, `expectedRevision`으로 오래된 버전을 거절한다. 시연 사례 5개는 전부 `sourceType: "demo"`로 표시된다.

## 파일과 담당 (v2 §11)

| 담당        | 파일                                                                                                                                                                                                                      | 현재 상태                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A 프런트    | `wam/src/pages/Failfair/*`, `wam/src/pages/Senior/*`, `wam/src/components/failfair/*`, `wam/src/utils/seniorInterview.ts`, `wam/src/hooks/useFailfair*.ts`, `wam/src/index.css`                                           | 학생은 대화 한 화면 + 비교·상세, 선배는 인터뷰. 다듬기·모바일 폭·오류 상태 보강      |
| B 백엔드    | `packages/shared/src/failfair.ts`, `server/src/failfair/functions.ts`, `session.service.ts`, `case.repository.ts`, `sos.service.ts`, `feedback.store.ts`, `records.ts`, `cloudflare/migrations/0002_failfair_storage.sql` | Function 17개 동작. 사례·세션·SOS·피드백은 D1 전용 테이블, 모델 설정만 `app_records` |
| C 대화·검색 | `server/src/failfair/model-gateway.ts`, `retrieval.service.ts`                                                                                                                                                            | 규칙 기반 게이트웨이와 점수 매칭. LLM 게이트웨이는 `createModelGateway`에 끼우면 됨  |
| D 콘텐츠·QA | `packages/shared/src/cases.ts`, `docs/`, `scripts/smoke-*.mjs`                                                                                                                                                            | 가상 사례 5개. 실제 사례는 선배 입력 화면으로 등록 후 승인                           |

## 저장소: D1 전용 테이블

`cloudflare/migrations/0002_failfair_storage.sql`. 한 행 = 한 개체이고, 필터·정렬·잠금에 쓰는 값만 컬럼이며 원문은 공유 Zod 스키마로 검증한 JSON(`body_json`)이다.
번들의 가상 사례 20건은 DB에 넣지 않고 읽을 때 합친다. 같은 id의 행이 DB에 있으면 그쪽이 이긴다 (가상 사례를 숨기면 그렇게 된다).

| 테이블              | 한 행               | 동시성 규칙                                                                                                                               |
| ------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `failfair_cases`    | 사례 (CaseSchema)   | id로 upsert. 두 선배가 동시에 등록해도 둘 다 남는다                                                                                       |
| `failfair_sessions` | 학생 대화 세션 통째 | `UPDATE ... WHERE revision = ?`. 0행이면 `STALE_SESSION`. 메모리 검사와 별개로 DB가 한 쪽만 받는다                                        |
| `failfair_requests` | 변경 요청의 응답    | 세션 UPDATE와 **같은 batch(트랜잭션)** 에서만 쓴다. 응답 기록은 `last_request_id`가 내 요청일 때만 들어가므로 둘 중 하나만 남는 일이 없다 |
| `failfair_feedback` | 도움 됨·도구 복사   | `request_id` 기본키. 같은 클릭은 한 번만 쌓이고 `case_id`로 사례별 집계가 된다                                                            |
| `failfair_sos`      | SOS 요청            | 아래 "저장은 요청마다 한 행"                                                                                                              |

`app_records`에는 행 하나로 끝나는 모델 설정 `failfair:model`과, 롤백 대비 거울인 `failfair:cases` 배열만 남는다.
단위 테스트의 SQLite 대역(`server/src/test-database.ts`)이 이 마이그레이션 파일을 그대로 실행하므로, 스키마와 코드가 어긋나면 운영이 아니라 테스트에서 먼저 깨진다.

### 옛 데이터 이관과 롤백

전용 표가 생기기 전 `app_records`에 쌓인 사례·세션·SOS·피드백은 `server/src/failfair/legacy-import.ts`가 표로 옮긴다.
"한 번만" 표식을 두지 않고 **isolate가 뜰 때마다** 첫 요청 전에 다시 돌린다 (`serverless.ts`). 모든 쓰기에 "표가 더 새로우면 건드리지 않는다" 조건이 있어 여러 번 돌아도 안전하다.

- 사례는 `version`, 세션은 `revision`이 더 클 때만 덮는다. 세션의 `lastRequest`는 `failfair_requests`로 옮겨 마지막 요청의 재전송도 이어진다.
- SOS는 `INSERT OR IGNORE`. 옛 쪽에서 답이 달렸는데 표는 아직 대기 중이면 그 답을 따르고, 반대로는 건드리지 않는다.
- 피드백은 `request_id` 기준 `INSERT OR IGNORE`.

새 코드는 사례를 저장할 때 옛 `failfair:cases` 배열에도 같은 사례를 남긴다 (거울). 코드를 되돌리면 옛 코드는 그 배열만 읽으므로, 거울이 없으면 숨긴 사례가 다시 보이고 새로 등록한 사례가 사라진 것처럼 보인다.
표가 정답이고 거울은 롤백 대비용이다. 세션·SOS·피드백은 거울을 두지 않는다. 그래서 **코드만 되돌리면 새 코드로 진행한 대화와 SOS는 옛 코드에서 보이지 않는다.** 되돌린 동안 옛 코드가 쓴 것은 다음 배포의 이관이 다시 가져온다.

로컬에 옛 `0002_failfair.sql`을 적용해 둔 경우 초기화한다:

```sh
rm -rf .wrangler/state && corepack pnpm db:migrate:local
```

## SOS: 새내기 → 실제 선배

결과 화면 맨 위와 사례 상세에 "🆘 SOS 보내기"가 있다. 사례 상세에서는 그 사례의 선배(실제 경험 + 연락 허용, 가상·본인 사례 제외)에게 보내고,
결과 화면에서는 사례를 고르지 않아도 된다 — 서버가 **매칭**한다 (`chooseContactableCase`): 이 대화의 결과에 연결된 연락 가능한 선배를 결과 순서대로 우선하고,
없으면 같은 카테고리에서 연락을 허용한 실제 선배 중 가장 최근 등록. 아무도 없으면 `NO_SENIOR_AVAILABLE`.
선배의 신원은 사례 등록 때 저장한 채널톡 매니저 ID다. 학과·학번은 받지 않는다.

1. 새내기가 한두 줄 메시지(상황 요약이 기본으로 채워짐)로 SOS를 보낸다 → `failfair.sosRequest`. 같은 사례에 대기 중 요청이 있으면 그것을 돌려준다.
2. 알림은 세 갈래로 나간다. 어느 것이 실패해도 요청은 저장되고 선배 수신함에 보인다.
   - **채널톡 1:1 DM**: `findOrCreateDirectChat`으로 두 사람의 DM을 찾거나 열고, `writeDirectChatMessageAsManager`로 새내기 이름으로 SOS 문구를 올린다. 선배는 DM 알림을 받는다. 방 ID는 요청에 `directChatId`로 남는다. 앱에 이 두 권한이 없으면 조용히 건너뛴다 (`directChat=false`).
   - **그룹 봇 알림**: 그룹 채팅에서 연 경우 그 방에 봇(망선박)이 알림을 올린다 (`notified`).
   - **앱 안 수신함**: 선배가 `/망선박` 첫 화면의 "🆘 나에게 온 SOS"(대기 건수 표시) 또는 선배 → SOS 요청에서 본다. 수신함은 5초마다 새로 읽는다.
3. 선배가 수락·거절 → `failfair.sosRespond`. 받은 선배만 답할 수 있고 한 번만 바뀐다. 수락하면 DM에 선배 이름으로 수락 문구, 그룹에 봇 알림.
4. **채팅**: 수락된 요청 안에서 두 사람이 앱 안 스레드로 바로 대화한다 (`failfair.sosSend`, `failfair.sosThread`, 표 `failfair_sos_messages`). 새내기 화면은 4초마다 스레드를 읽어 선배가 수락하는 순간 스스로 바뀐다. DM이 열렸으면 그쪽에서 이어 가도 된다.

### 알림이 갈 그룹은 서버가 정한다

`failfair.open`이 호스트에게서 받은 방을 `{channelId, groupId, managerId, chatTitle, expiresAt}`로 서명해 WAM에 `chatToken`으로 내려 주고(`server/src/target-token.ts`),
`sosRequest`는 클라이언트가 보낸 방 ID 대신 이 표식만 믿는다. 서명·채널·호출자 일치·만료를 모두 확인하며(`verifyChatTarget`),
표식이 없거나 맞지 않으면 **그룹 봇 알림만 건너뛴다** (예전에는 요청 자체를 거절했다. DM과 앱 안 스레드가 생겨 그룹이 필수가 아니다).

요청은 시작된 방의 이름(`chatTitle`)을 함께 지니고 다닌다. 선배 수신함은 채널 전체를 보여 주므로 다른 방에서 온 요청도 보이는데,
그때 어느 방으로 가야 하는지를 이 이름으로 알린다.

### 저장은 요청마다 한 행

`failfair_sos`에 요청 하나가 한 행이다. 전체 목록을 한 키에 배열로 두면
"읽고 → 고치고 → 통째로 덮어쓰는" 사이에 남의 요청이나 이미 끝난 수락이 사라진다 (실제로 재현됐다).

- 새 요청: `INSERT OR IGNORE`. (채널·사례·새내기)당 대기 중 요청은 부분 유니크 인덱스로 하나뿐이라, 자리를 차지한 쪽만 `created=true`가 된다. 거절·수락된 요청은 이력으로 남고 새 요청을 다시 넣을 수 있다.
- 재전송: 화면이 전송마다 `requestId`를 만들고 "다시 시도"에도 같은 값을 쓴다. 서버는 이 값으로 저장된 요청을 **상태와 무관하게** 돌려주므로, 응답만 잃은 사이 선배가 수락했어도 새 SOS가 생기지 않는다.
- 수락·거절: `UPDATE ... WHERE status = 'pending'`. 실제로 바뀐 쪽만 `changed=true`가 되고 알림도 그때만 나간다.
- 스레드 말: `failfair_sos_messages`에 말 하나가 한 행. `(sos_id, request_id)` 유니크라 같은 클릭이 두 번 쌓이지 않는다. 두 당사자만 읽고 쓰며, 수락 전에는 보낼 수 없다.
- DM 방 ID: `body_json.directChatId`가 비어 있을 때만 붙인다.

### 앱 권한

DM 갈래에는 채널톡 앱에 `findOrCreateDirectChat`, `writeDirectChatMessageAsManager` 네이티브 함수 권한이 필요하다. 그룹 봇 알림에는 `writeGroupMessage`.
권한이 없으면 해당 갈래만 건너뛰고 로그에 어느 권한인지 남긴다. 앱 안 스레드는 권한과 무관하게 항상 된다.

## 아직 없는 것

- 실제 모델 연결. `MODEL_PROVIDER`, `MODEL_API_KEY`가 없으면 규칙 기반으로 동작한다. 키는 운영진이 Workers 비밀 변수로 넣어야 한다.
- 세션 만료·삭제, 대화 원문 보관 정책. 표에 `updated_at`이 있어 지울 수는 있지만 아직 아무도 지우지 않는다.
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
3. `0002_failfair_storage.sql` 원격 적용. **적용이 끝난 뒤에** 의존 코드를 main에 합친다. 표만 추가하므로 옛 코드도 그대로 돌지만, 롤백의 한계는 위 "옛 데이터 이관과 롤백"을 본다.
