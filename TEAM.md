# SKKU 2026 team4

- 레포: https://github.com/skku-channel-hackathon-2026/team4
- 채널톡 앱: `SKKU 2026 Team4` (`6aab941be5909c4c2bb4`)
- 앱 관리: https://channel.works/-/developers/apps/6aab941be5909c4c2bb4/general
- 공통 채널: 성균관대 해커톤
- 검증 그룹: https://channel.works/xd1l0/team-chat/groups/609235
- 서버: https://skku-team4.skku-hackathon-2026.workers.dev
- 전용 D1: `skku-team4` (`374f66be-3129-4195-b8b8-3978bbc14299`)
- 자동 배포: PR 머지 후 main CI가 성공하면 웹훅으로 Cloudflare 자동 배포를 실행합니다. 실행 대기·빌드 시간이 필요합니다.

참가팀 11개 앱과 준비위 team0 앱은 같은 채널에 설치되어 있습니다. `/tutorial` 목록에서 `SKKU 2026 Team4`을 선택하세요.
팀별 앱·서버·DB는 각각 분리되어 있습니다. 채널과 테스트 대화방은 함께 사용합니다.

## 테스트할 때

`앱_개발_검증` 공개 그룹에서 실행하세요. 봇의 `writeGroupMessage` API는 비공개 그룹 전송을 지원하지 않습니다.
현재 튜토리얼 WAM은 봇 전송 실패에도 닫힐 수 있으므로, 닫힌 것만으로 성공으로 판단하지 말고 실제 메시지를 확인하세요.
기존 `docs/desk-qa.md`는 team1 파일럿 기록입니다.

[개발·DB 마이그레이션 안내](HACKATHON.ko.md)를 확인하세요.
DB 스키마 변경은 `cloudflare/migrations/`의 SQL로 관리하며 원격 적용은 운영자가 수행합니다.
팀장에게 이 레포 Admin·해당 앱 owner 초대를 발송했습니다. 각 초대를 수락한 뒤 개발하세요.
앱 초대 확인: [개발자 앱 목록](https://channel.works/-/developers/apps).
