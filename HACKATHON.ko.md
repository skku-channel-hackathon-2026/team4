# 성균관대 해커톤 개발 가이드

> 배포 안내 (2026-09-19): 서버는 Vercel Hobby, DB는 기존 팀 전용 Cloudflare D1을 사용합니다. PR을 main에 머지하고 CI가 통과하면 SQL 마이그레이션 후 자동 배포됩니다. Vercel 초대나 수동 배포는 필요 없습니다. 로컬 DB 개발은 기존 Wrangler 명령을 사용합니다.
> 운영 DB 연결은 팀별 키로 분리되며 `prepare/bind/run/first/all`을 지원합니다. HTTP 연결에서는 `.batch()`를 지원하지 않습니다.

공식 `channel-io/app-tutorial-ts`와 Channel App SDK 0.17.2를 기반으로 합니다.
서버는 Vercel Hobby, DB는 팀별 Cloudflare D1(SQLite), 화면은 React WAM입니다.
Node.js 24와 pnpm 11.24.0을 사용합니다. `pnpm-lock.yaml`을 함께 커밋하세요.

## 초대 수락 후 확인할 것

앱 초대는 [개발자 앱 목록](https://channel.works/-/developers/apps)에서 확인하고 수락합니다.
초대 이메일과 같은 계정으로 로그인하세요. GitHub 레포 초대와 채널 멤버 초대는 별개입니다.

| 권한                  | 할 수 있는 일                            |
| --------------------- | ---------------------------------------- |
| 팀 GitHub 레포 Admin  | 코드·SQL 수정, 브랜치·PR 생성, main push |
| 채널톡 앱 owner 권한  | 앱 설정·익스텐션·권한 확인 및 개발       |
| 공통 해커톤 채널 멤버 | 설치된 앱 실행과 팀 테스트               |

Cloudflare 계정 권한 없이 코드와 SQL을 PR로 배포할 수 있습니다. 원격 DB 마이그레이션은 자동 적용됩니다.
서버 비밀 키 변경과 비공개 배포 로그 확인은 운영진에게 요청하세요. 앱 개발 권한과 채널 멤버 권한은 별개입니다.

team4 리소스:

- 레포: https://github.com/skku-channel-hackathon-2026/team4
- Worker 이름: `skku-team4`
- 팀별 배포·앱 연결 현황: [TEAM.md](TEAM.md)

이 팀의 Worker·DB·앱을 운영진이 개별로 연결합니다. 다른 팀의 주소·비밀 키를 사용하지 마세요.
팀 앱은 공통 성균관대 해커톤 채널에 설치되어 있습니다. `docs/desk-qa.md`는 초기 team1 파일럿 기록이며, 현재 팀별 연결은 `TEAM.md`를 확인하세요.

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
단독 브라우저에는 Desk의 WAM 컨텍스트가 없으므로 실제 연결 검증은 공통 해커톤 채널에서 해야 합니다.

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

4. SQL과 해당 스키마를 사용하는 코드를 같은 PR에 포함합니다. PR CI는 로컬 D1에 마이그레이션을 적용하고 테스트합니다.
5. PR을 `main`에 머지합니다. main CI 성공 후 운영자 컨트롤러가 **배포할 커밋의 SQL → 팀 전용 원격 D1 적용 → 앱 배포** 순서로 자동 실행합니다. 수동 적용 요청은 필요하지 않습니다.
6. 앱에서 실제 저장·조회를 확인합니다. CI 성공만으로 원격 적용·배포 완료를 판단하지 말고, 오류가 나면 팀명·커밋 SHA와 함께 운영진에게 로그 확인을 요청하세요.

파일명은 `0002_add_members.sql`처럼 고유한 숫자 순번과 영문·숫자·밑줄·하이픈을 사용합니다.
마이그레이션 디렉터리에는 일반 SQL 파일만 넣으세요. 파일당 최대 1 MiB, 최대 500개를 지원합니다.
D1의 적용 이력에 기록된 파일은 다시 적용하지 않습니다. **이미 적용한 파일은 수정·삭제하지 말고 새 파일로 보정**하세요.

마이그레이션이 실패하면 새 앱 배포는 중단됩니다. 여러 파일 중 앞서 성공한 파일은 적용 상태로 남을 수 있습니다.
SQL 성공 후 앱 배포가 실패한 경우에도 DB 변경은 유지되고, 재시도 시 적용 이력을 기준으로 미적용 파일만 실행합니다.
실패 원인을 수정한 뒤 새 PR을 머지하거나 운영진에게 같은 커밋 재배포를 요청하세요.

마이그레이션 도중에는 기존 앱이 실행 중이므로 새 테이블·컬럼을 먼저 추가하는 등 이전 버전과 호환되게 작성하세요.
컬럼·테이블 삭제와 데이터 삭제도 머지한 SQL대로 실행됩니다. 필요한 데이터를 백업하고 팀 내에서 변경을 검토하세요.
코드 revert는 DB 스키마를 되돌리지 않습니다. 새 보정 SQL로 복구하며, 데이터 복원이 필요하면 운영진에게 요청합니다.

로컬 DB와 원격 DB는 별개이며 로컬 데이터가 원격으로 복사되지는 않습니다. `.wrangler`를 Git에 올리지 마세요.
앱 재배포는 DB를 초기화하지 않습니다. Cloudflare DB 토큰은 비공개 컨트롤러에서만 사용하며 팀 레포에 추가하지 않습니다.

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
- PR을 `main`에 머지하고 main CI가 성공하면 웹훅이 비공개 배포 컨트롤러를 즉시 실행해 미적용 SQL을 원격 D1에 적용한 뒤 앱을 배포합니다.
  GitHub 실행 대기와 빌드·업로드 시간은 필요하며, 여러 push가 겹치면 최신 성공 커밋을 반영합니다.
- CI가 실패하거나 개인 브랜치/PR 검사만 성공한 경우 배포하지 않습니다. 웹훅 장애 시 운영진이
  재전송·수동 재배포하며, 스케줄 확인은 지연될 수 있는 보조 복구 수단입니다.
- 팀 레포의 CI 성공과 실제 배포 성공은 별개입니다. 배포 SHA·오류 로그는 운영진에게 확인하세요.
- 일반 로직/UI 변경은 재배포하면 반영됩니다. Function 스키마·익스텐션·커맨드 메타데이터를
  바꿨다면 배포 후 운영진에게 등록 갱신도 요청합니다.
- main CI 성공이 배포의 필수 조건입니다. main에 합치기 전에도 아래 검증을 완료하세요.

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
실행합니다. 운영 배포에서는 자동 등록하지 않습니다. 앱 비밀 키는 WAM 코드, Git, 이슈, 채팅,
README에 넣지 마세요. `.dev.vars`와 `server/.env`도 커밋하지 않습니다.

## Desk에서 앱 확인하기

공통 성균관대 해커톤 채널의 공개 `앱_개발_검증` 그룹에서 `/tutorial`을 입력하고 커맨드를 선택한 뒤 실행합니다.
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

Vercel Hobby, D1, GitHub Actions에는 요청·CPU·저장량·빌드 사용량 한도가 있습니다.
유료 업그레이드는 하지 않으므로 한도에 도달하면 운영진에게 알려주세요.
WebSocket, Nest microservices, class-validator, class-transformer는 현재 Workers 번들에서
제외되어 있습니다. 입력 검증에는 기존 Zod를 사용합니다.

장애 보고에는 팀명, 커밋 SHA, 발생 시각, `/api/health`·`/api/ready` 결과, 재현 순서와
비밀 키를 가린 오류 화면을 포함하세요. 이전 커밋의 revert를 main에 push하면 코드 복구도
같은 배포 흐름을 따릅니다. 긴급 복구는 운영진에게 요청하세요.

## 인계 체크리스트

- GitHub Admin·앱 소유자 권한·공통 채널 초대를 모두 수락합니다.
- 로컬 Worker·D1 실행과 SQL 적용을 확인합니다.
- 작은 화면 변경을 main에 반영하고 실제 Desk에서 배포 결과를 확인합니다.
- DB 변경은 SQL을 PR에 포함해 자동 적용합니다. 익스텐션 등록 갱신·비밀 키 변경은 운영진과 진행합니다.
- 현재 검증 결과와 남은 항목은 [Desk 검증 기록](docs/desk-qa.md)을 참고하세요.
