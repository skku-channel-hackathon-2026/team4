# SKKU 2026 team4 — Channel App

**SKKU 2026 team4** · [이 팀의 리소스와 준비 상태](TEAM.md)

> **성균관대 해커톤 팀 개발 안내**: [시작하기·배포·DB 마이그레이션](HACKATHON.ko.md) · [Desk 검증 기록](docs/desk-qa.md)
> 팀 레포 Admin·채널톡 앱 owner 초대를 수락하고, 공통 성균관대 해커톤 채널에 참여하세요.
> 앱 초대 확인·수락: [개발자 앱 목록](https://channel.works/-/developers/apps) — 초대 이메일과 같은 계정으로 로그인합니다.
> 팀 레포는 **PR 머지 → main CI 성공 → 웹훅 → Cloudflare Workers 자동 배포** 순서입니다. 빌드·실행 대기 시간이 필요합니다.
> 원격 DB 마이그레이션·앱 비밀 키 변경·익스텐션 등록 갱신은 운영진에게 별도로 요청합니다. Vercel 또는 Cloudflare 계정 초대는 필요하지 않습니다.

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

SKKU hackathon teams: see the [Cloudflare deployment and database guide](HACKATHON.ko.md).

A minimal Channel App Store app built with the official
[Channel App SDK](https://github.com/channel-io/app-sdk). It demonstrates the current SDK path
instead of implementing token exchange, extension registration, signature verification, and WAM
bindings by hand.

Use this repository for a runnable end-to-end app. Use the SDK repository for the API contract and
design guidance:

- [English first-app quickstart](https://github.com/channel-io/app-sdk/blob/main/docs/guides/en/quickstart.md)
- [English app-development guide](https://github.com/channel-io/app-sdk/blob/main/docs/guides/en/app-development.md)
- [English concepts: Function, Extension, WAM, and authentication](https://github.com/channel-io/app-sdk/blob/main/docs/guides/en/concepts.md)
- [English Extension guide](https://github.com/channel-io/app-sdk/blob/main/docs/guides/en/extensions.md)
- [한국어 앱 개발 전체 가이드](https://github.com/channel-io/app-sdk/blob/main/docs/guides/ko/app-development.md)
- [한국어 핵심 개념](https://github.com/channel-io/app-sdk/blob/main/docs/guides/ko/concepts.md)
- [한국어 Extension 전체 가이드](https://github.com/channel-io/app-sdk/blob/main/docs/guides/ko/extensions.md)
- [日本語アプリ開発完全ガイド](https://github.com/channel-io/app-sdk/blob/main/docs/guides/ja/app-development.md)
- [日本語の基本概念](https://github.com/channel-io/app-sdk/blob/main/docs/guides/ja/concepts.md)
- [日本語 Extension 完全ガイド](https://github.com/channel-io/app-sdk/blob/main/docs/guides/ja/extensions.md)
- [Authentication and tokens](https://github.com/channel-io/app-sdk/blob/main/docs/reference/typescript/AUTH-AND-TOKENS.md)
- [TypeScript architecture](https://github.com/channel-io/app-sdk/blob/main/docs/reference/typescript/ARCHITECTURE.md)
- [Command extension](https://github.com/channel-io/app-sdk/blob/main/docs/reference/typescript/extensions/command.md)
- [WAM SDK](https://github.com/channel-io/app-sdk/blob/main/docs/reference/typescript/WAM.md)

## What this app demonstrates

- `@channel.io/app-sdk-server` and `@channel.io/app-sdk-wam` `0.17.2`
- a `command` extension registered by operators for the deployed Workers app
- typed app functions with Zod input/output schemas
- SDK-managed app/channel token caching and refresh
- HMAC request verification with the SDK signature guard
- a React WAM using `@channel.io/app-sdk-wam` hooks
- a shared Zod contract package used by both the server and React WAM
- redesigned Bezier components from `@channel.io/bezier-react/beta`
- normalization of nullable optional command fields currently emitted by AppStore

Run the `/tutorial` desk command in a group chat to open a WAM. The WAM can send a team-chat message
either through the app bot (server-side app function) or as the current manager (WAM native
function). Other chat types show an explicit unsupported message instead of silently closing.

Concepts in this repository map to concrete code as follows:

- **Extension**: `CommandExtension` publishes command metadata as the versioned `command` capability.
- **Function**: `tutorial.open` and `tutorial.sendAsBot` are standalone typed operations referenced by the command and WAM.
- **WAM**: the React UI is served at `/resource/wam/tutorial`; `useCallFunction` calls the app server and `useNativeFunction` acts as the current manager.
- **Authentication**: `SignatureGuard` verifies inbound requests, `TokenManager` caches the channel token used by the bot path, the server signs the allowed group-chat target before giving it to the WAM, and the Channel host owns manager authorization.

## SDK contract alignment

This tutorial follows the public SDK runtime contract:

- NestJS with `ChannelAppModule`
- decorated, schema-backed functions
- `PUT /functions/:version` (`/functions/v1` for the command extension)
- extension discovery and registration through the SDK/AppStore
- a narrow ingress compatibility mapping from bare `PUT /functions` calls to the same verified
  `v1` handler when the caller does not carry a system version

This app pins `0.17.2` for reproducible builds. Workers disables startup auto-registration;
operators update registration after function schemas or extension metadata change.
Its WAM uses only public SDK hooks and Bezier APIs.

## 해커톤 개발 시작

Node.js 24와 pnpm 11.24.0을 사용합니다. 이 레포를 clone하세요.

```sh
git clone https://github.com/skku-channel-hackathon-2026/team4.git
cd team4
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm build:cloudflare
```

[개발 가이드](HACKATHON.ko.md)의 가짜 로컬 환경값으로 `.dev.vars`를 만든 후 실행합니다.

```sh
corepack pnpm db:migrate:local
corepack pnpm dev:cloudflare
```

`.dev.vars`는 Git에 포함하지 않습니다. 로컬 DB와 원격 DB는 별개입니다.
D1을 사용하는 기능은 Wrangler로 실행하세요. Node 서버만 실행하면 D1이 제공되지 않습니다.
실제 Desk/API 연동에 필요한 키와 테스트 설정은 운영진에게 요청하세요.
이미 연결된 팀 앱의 Endpoint를 개인 로컬 주소로 변경하지 마세요.

## 배포와 확인

팀 레포에서 작업 브랜치의 PR을 `main`에 머지하면 main CI 성공 후 자동 배포됩니다.
PR 검사만 성공하거나 main CI가 실패한 경우에는 배포되지 않습니다.
서버는 Cloudflare Workers Free, DB는 팀별 D1입니다. 별도 Vercel 배포는 사용하지 않습니다.
CI 성공과 배포 완료는 별개이며, 배포 로그·커밋 SHA는 운영진이 확인할 수 있습니다.
`/api/health`는 서버 상태, `/api/ready`는 실제 D1 연결(`SELECT 1`)을 확인합니다.
이 상태 검사만으로 기능의 데이터 저장·조회까지 검증되는 것은 아닙니다.

DB 변경은 `cloudflare/migrations/`의 새 SQL 파일로 관리하고, **해당 스키마를 쓰는 코드의
머지 전에** 운영진에게 원격 적용을 요청하세요. 코드 배포가 SQL을 자동 적용하지 않습니다.
Function 스키마·익스텐션·커맨드 메타데이터 변경 후에는 앱 등록 갱신도 요청합니다.

## Project map

### 발표용 음성

학생 대화의 `음성 시연`을 펼쳐 시연 토큰을 입력하고 켜면, 이후 입력과 답변을
학생·선배 목소리로 순서대로 읽습니다. `중지`, `마지막 대사 다시 듣기`를 지원합니다.
기본값은 OFF이며, 실패하면 텍스트 대화는 계속됩니다. 새 세션에서는 다시 켜 주세요.

Wrangler의 `.dev.vars`(배포 시 Worker secrets)에 아래 값을 설정합니다.
Node 서버에서는 `server/.env`를 사용합니다. 키나 토큰은 Git에 넣지 않습니다.

- `ELEVENLABS_API_KEY`: Text to Speech 권한이 있는 API 키
- `ELEVENLABS_STUDENT_VOICE_ID`: `cgSgspJ2msm6clMCkdW9` (`Jessica`)로 설정됨
- `ELEVENLABS_ASSISTANT_VOICE_ID`: `pNInz6obpgDQGcFmaJgB` (`Adam`)로 설정됨
- `ELEVENLABS_MODEL_ID`: `eleven_flash_v2_5`로 설정됨
- `DEMO_TTS_TOKEN`: 별도로 생성한 충분히 긴 무작위 발표자 토큰. 화면에는 이 값만 입력합니다.

API 키는 서버에만 보관하고 `/api/tts`는 발표자 토큰을 검사합니다. 토큰은 브라우저
메모리에만 유지합니다. 학생 입력과 답변 텍스트가 ElevenLabs로 전달되므로 발표용
가상 대화를 사용하세요. 시연이 끝나면 서버 토큰을 제거해 호출을 비활성화합니다.
Vite는 `/api/tts`를 로컬 Worker(8787)로 전달합니다.
MP3 스트리밍을 지원하는 브라우저에서는 수신 중 재생하고, 미지원 시 완성 음원을
재생합니다. 첫 소리까지 모델·네트워크 지연이 있으며, 실제 Desk의 재생 허용과 음질은
발표 기기에서 확인해야 합니다. 사례 카드는 자동 낭독 대상에 포함되지 않습니다.

```text
server/
  src/app.module.ts          SDK module, registration configuration, signature guard
  src/function-endpoint.ts   bare Function Endpoint to v1 ingress mapping
  src/tutorial.functions.ts command metadata and typed app functions
  src/target-token.ts        short-lived signed group target for the bot path
packages/shared/
  src/index.ts               WAM data and app/native function wire contracts
wam/
  src/hooks/                 validates host data with the shared Zod contract
  src/pages/Send/Send.tsx    WAM SDK hooks for app/native calls
```

Use the SDK guides and references for the current contract, and use this repository for its complete
server-and-WAM implementation. The SDK quickstart links here when runnable TypeScript code is useful.
