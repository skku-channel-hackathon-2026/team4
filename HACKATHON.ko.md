# 성균관대 해커톤 개발 가이드

공식 `channel-io/app-tutorial-ts`와 Channel App SDK 0.17.2를 기반으로 합니다.
서버는 Cloudflare Workers Free, DB는 팀별 Cloudflare D1(SQLite), 화면은 React WAM입니다.
Node.js 24와 pnpm 11.24.0을 사용합니다. `pnpm-lock.yaml`을 함께 커밋하세요.

## 초대 수락 후 확인할 것

| 권한                 | 할 수 있는 일                            |
| -------------------- | ---------------------------------------- |
| 팀 GitHub 레포 Write | 코드·SQL 수정, 브랜치·PR 생성, main push |
| 채널톡 앱 개발 권한  | 앱 설정·익스텐션·권한 확인 및 개발       |
| 팀 전용 채널 멤버    | 설치된 앱 실행과 팀 테스트               |

Cloudflare 계정 권한 없이도 코드 배포가 가능합니다. 원격 DB 마이그레이션, 서버 비밀 키 변경,
배포 로그 확인은 운영진에게 요청하세요. 앱 개발 권한과 채널 멤버 권한은 별개입니다.

team4 리소스:

- 레포: https://github.com/skku-channel-hackathon-2026/team4
- Worker 이름: `skku-team4`
- 팀별 배포·앱 연결 현황: [TEAM.md](TEAM.md)

이 팀의 Worker·DB·앱을 운영진이 개별로 연결합니다. 다른 팀의 주소·비밀 키를 사용하지 마세요.
공통 스타터의 Desk 검증 기록은 team1 파일럿 근거이며 이 팀의 설치 완료를 의미하지 않습니다.

## 코드 구조

| 위치                               | 용도                           |
| ---------------------------------- | ------------------------------ |
| `server/src/tutorial.functions.ts` | Function·커맨드 구현           |
| `wam/src/pages/Send/Send.tsx`      | WAM 화면                       |
| `packages/shared/src/index.ts`     | 공유 타입·Zod 입력/출력 스키마 |
| `server/src/database.ts`           | 현재 요청의 D1 접근            |
| `cloudflare/migrations/`           | 버전별 DB 스키마 변경 SQL      |
| `cloudflare/worker.mjs`            | Workers HTTP 진입점            |
| `wrangler.jsonc`                   | 로컬 실행과 팀 DB 바인딩       |

## 로컬에서 서버와 DB 실행

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build:cloudflare
```

레포 루트에 `.dev.vars`를 만듭니다. 다음 값은 오프라인 로컬 테스트용 가짜 값입니다.
실제 채널톡 API 호출에는 사용할 수 없습니다. 이 파일은 Git에서 제외됩니다.

```dotenv
APP_ID=local-test-app
APP_SECRET=local-test-secret
SIGNING_KEY=1111111111111111111111111111111111111111111111111111111111111111
APP_STORE_URL=https://app-store-api.channel.io
```

```sh
corepack pnpm db:migrate:local
corepack pnpm dev:cloudflare
```

출력된 localhost 주소에서 `/api/health`, `/api/ready`를 확인합니다.
화면을 수정한 뒤에는 `corepack pnpm build:cloudflare`로 WAM 정적 파일도 다시 빌드합니다.
UI만 빠르게 개발할 때는 `corepack pnpm dev:wam`을 사용할 수 있지만,
단독 브라우저에는 Desk의 WAM 컨텍스트가 없으므로 실제 연결 검증은 전용 채널에서 해야 합니다.

기존 `dev:server`는 Node 서버만 실행하며 D1을 제공하지 않습니다. DB 사용 기능은 Wrangler에서
실행하세요. 별도 개발 앱을 로컬 HTTPS 터널과 연결할 때는 운영진과 Endpoint를 조율합니다.
팀이 공유하는 배포 앱의 Endpoint를 개인 localhost 주소로 바꾸지 마세요.

## DB 마이그레이션: SQL 파일로 관리

현재 `0001_initial.sql`에 `app_records` 테이블이 있습니다. D1이 적용 이력을 기록하므로
이미 적용한 파일은 다시 실행하지 않습니다. **적용한 파일을 수정하지 말고 새 파일을 추가**하세요.

1. 작업 브랜치에서 마이그레이션을 생성합니다.

   ```sh
   corepack pnpm exec wrangler d1 migrations create DB add_members
   ```

2. 생성된 `cloudflare/migrations/0002_add_members.sql`에 SQL을 작성합니다. 예:

   ```sql
   CREATE TABLE members (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
   ```

3. 로컬에 적용하고 데이터를 넣고 읽는 흐름을 확인합니다.

   ```sh
   corepack pnpm db:migrate:local
   corepack pnpm exec wrangler d1 execute DB --local --command="SELECT name FROM sqlite_master WHERE type = 'table';"
   ```

4. SQL과 코드를 커밋하고, **새 스키마에 의존하는 코드를 main에 합치기 전에** 운영진에게 적용을
   요청합니다. 팀명, PR/커밋 URL, SQL 파일명, 데이터 삭제 여부, 필요한 배포 순서를 전달하세요.
5. 운영진의 원격 적용 완료를 확인한 뒤 의존 코드를 main에 합칩니다.

원격 적용은 자동 배포에 포함되지 않습니다. 운영진은 해당 팀 레포와 DB ID를 확인한 뒤 실행합니다.

```sh
# 운영진 전용: 현재 설정이 해당 팀 DB를 가리키는지 먼저 확인
corepack pnpm exec wrangler d1 migrations list DB --remote
corepack pnpm exec wrangler d1 migrations apply DB --remote
```

앱 재배포는 DB를 초기화하지 않습니다. 로컬 DB와 원격 DB는 별개이며 자동 동기화되지 않습니다.
`.wrangler` 안의 로컬 DB를 Git에 올리지 마세요. 적용 순번이 충돌하면 미적용 파일의 순서를
팀 내에서 정리합니다. 컬럼·테이블 삭제는 기존 코드와 데이터를 깨뜨릴 수 있으므로 별도 협의합니다.
배포 코드를 되돌려도 DB 스키마는 되돌아가지 않습니다. 보통 새 보정 SQL로 수정하고,
데이터 복구가 필요하면 추가 변경 전에 운영진에게 요청하세요.

### Function에서 D1 사용

```ts
import { getDatabase } from "./database.js";

const record = await getDatabase()
  .prepare("SELECT value_json FROM app_records WHERE id = ?")
  .bind(recordId)
  .first<{ value_json: string }>();
```

요청을 처리하는 Function 안에서 `getDatabase()`를 호출합니다. 모듈 초기화 시 호출하지 않습니다.
사용자 입력은 SQL 문자열에 직접 이어 붙이지 말고 `.bind()`로 전달하세요.
`app_records.value_json`에는 JSON 문자열을 저장하며, UPDATE 시 `updated_at`도 쿼리에서 갱신합니다.
D1은 SQLite이므로 PostgreSQL/MySQL 전용 문법은 사용할 수 없습니다.

## 배포와 익스텐션 등록

- `main` push가 배포 대상입니다. 개인 브랜치는 자동 배포하지 않습니다.
- 운영진의 비공개 컨트롤러가 새 커밋을 5분 주기로 확인합니다. GitHub 스케줄 지연과 빌드 시간으로
  더 늦어질 수 있으며 여러 push가 겹치면 최신 커밋 기준으로 배포됩니다.
- 팀 레포의 CI 성공과 실제 배포 성공은 별개입니다. 배포 SHA·오류 로그는 운영진에게 확인하세요.
- 일반 로직/UI 변경은 재배포하면 반영됩니다. Function 스키마·익스텐션·커맨드 메타데이터를
  바꿨다면 배포 후 운영진에게 등록 갱신도 요청합니다.
- 현재 CI 성공을 기다렸다가 배포하는 구조는 아닙니다. main에 합치기 전에 아래 검증을 완료하세요.

```sh
corepack pnpm typecheck
corepack pnpm test
corepack pnpm lint
corepack pnpm build:cloudflare
```

로컬 런타임 검증은 가짜 `.dev.vars` 값과 마이그레이션을 준비한 뒤 다음과 같이 실행합니다.

```sh
# 터미널 1
corepack pnpm exec wrangler dev --local --port 8797
# 터미널 2
corepack pnpm test:cloudflare
```

등록 갱신은 운영진이 해당 팀 자격 증명을 안전하게 설정한 환경에서 `corepack pnpm register`로
실행합니다. Workers에서는 자동 등록하지 않습니다. 앱 비밀 키는 WAM 코드, Git, 이슈, 채팅,
README에 넣지 마세요. `.dev.vars`와 `server/.env`도 커밋하지 않습니다.

## Desk에서 앱 확인하기

전용 채널의 그룹 채팅에서 `/tutorial`을 입력하고 커맨드를 선택한 뒤 실행합니다.
튜토리얼 WAM에는 `Send as a manager`, `Send as a bot` 버튼이 있으며 각각 실제 메시지를
보냅니다. 운영진이 지정한 테스트 그룹에서만 사용하세요. DM·고객 상담방은 이 예제의 지원 대상이 아닙니다.

화면이 열리지 않으면 설치된 채널·활성 커맨드·배포 상태·Function/WAM Endpoint를 확인합니다.
전송이 실패하면 `writeGroupMessage`, `writeGroupMessageAsManager` 권한과 서명·앱 비밀 키 설정을
운영진에게 확인 요청합니다. 오래 열린 창에서 봇 전송이 실패하면 닫고 커맨드를 다시 실행하세요.
봇 대상 토큰은 5분 동안 유효합니다.

## 무료 환경과 장애 대응

팀별 Worker 1개·D1 1개를 사용합니다. Cloudflare 계정 토큰은 팀 레포에 없으며,
운영진이 Worker·계정·DB 매핑을 관리합니다. 이 매핑을 바꿔 다른 팀 DB를 연결할 수 없습니다.
메모리·로컬 파일은 영속 저장소가 아니므로 데이터를 D1에 저장하세요.

Workers Free, D1, GitHub Actions에는 요청·CPU·저장량·빌드 사용량 한도가 있습니다.
유료 업그레이드는 하지 않으므로 한도에 도달하면 운영진에게 알려주세요.
WebSocket, Nest microservices, class-validator, class-transformer는 현재 Workers 번들에서
제외되어 있습니다. 입력 검증에는 기존 Zod를 사용합니다.

장애 보고에는 팀명, 커밋 SHA, 발생 시각, `/api/health`·`/api/ready` 결과, 재현 순서와
비밀 키를 가린 오류 화면을 포함하세요. 이전 커밋의 revert를 main에 push하면 코드 복구도
같은 배포 흐름을 따릅니다. 긴급 복구는 운영진에게 요청하세요.

## 인계 체크리스트

- GitHub Write·앱 개발 권한·전용 채널 초대를 모두 수락합니다.
- 로컬 Worker·D1 실행과 SQL 적용을 확인합니다.
- 작은 화면 변경을 main에 반영하고 실제 Desk에서 배포 결과를 확인합니다.
- DB 변경 요청, 익스텐션 등록 갱신, 비밀 키 변경은 운영진과 진행합니다.
- 현재 검증 결과와 남은 항목은 [Desk 검증 기록](docs/desk-qa.md)을 참고하세요.
