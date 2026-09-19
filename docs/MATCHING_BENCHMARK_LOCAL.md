# 로컬 매칭 벤치마크와 개선 기록 — 1차 실험

이 문서는 분산 가중치 변경 **이전의 실험 기록**이다. 아래의 “현재”는 당시 스냅샷이며, 최신 구현·결과는 [분산 가중치 보고서](MATCHING_DISTRIBUTED_WEIGHTS.md)를 따른다.

2026-09-19. main `d316e37` 기반, 별도 브랜치 `kyu_beom-senior-matching`의 로컬 변경. main/운영 배포 없음.

## 무엇을 측정했나

학생이 확인한 상황 JSON + 행동 태그로 선배 사례를 찾는 구간만 평가했다. 모델 학습·파인튜닝·Gemini 호출은 하지 않았다. 테스트는 합성 고민/가상 사례이며 실제 사용자 정확도라고 해석하면 안 된다.

- 고정 질문 22개: 개발 11개 + 분리 검증 11개. 각 8개는 대표 사례 선택, 2개는 무관한 검색에서 사례 없음, 1개는 행동만 같을 때 정보 부족 고지.
- 진단 질문 6개: 동의어, 부정문, 반대 의미, 소수 평점, 시간 단위, 수강 학점.
- 각 질문에 저장소 순서 변경·결과/비용 변경·숨김 사례 제외·고민 반복 입력의 불변성 검사 4개. 이는 독립 질문 112개가 아니라 **28개 질문의 변형 검사**다.
- 기존 bundled golden 10개와 전체 서버 회귀 테스트도 별도 실행.

기대 사례 ID와 상황은 알고리즘 수정 전에 고정했고 보고서에 해시를 저장한다. 해시가 달라진 보고서는 비교를 거부한다. 예시의 사례를 반드시 출력하게 만드는 ID 분기·특정 시연 대본 조건은 없다.

검증 세트의 첫 결과는 제목/태그 수정 이후 열어 확인했다. 이후 명세 반영에서는 이미 확인한 이 세트도 재사용했으므로 최종 결과를 완전히 새로운 외부 검증이라고 부르지 않는다. 진단 세트 역시 현재는 알려진 개발/회귀 사례다. fixture의 “이번 수정에는 사용하지 않음” 메모는 최초 제목/태그 수정 실험 시점을 가리킨다.

## 결과

| 평가                            | 변경 전 | 현재 로컬 | 해석                                      |
| ------------------------------- | ------: | --------: | ----------------------------------------- |
| 개발 질문 전체                  |   10/11 |     11/11 | 제목·태그로 인한 오매칭 개선              |
| 분리 검증 질문 전체             |   10/11 |     11/11 | 다른 카테고리에서도 같은 문제 개선        |
| 대표 사례 1위 선택 (위 두 세트) |   14/16 |     16/16 | 합성 소규모 비교, 실제 서비스 정확도 아님 |
| 무관한 검색에서 사례 없음       |     4/4 |       4/4 | 무리한 참고 사례 생성 없음                |
| 행동만 일치할 때 정보 부족 고지 |     2/2 |       2/2 | 현재는 참고 상태로도 구분                 |
| 어려운 진단 질문                |     1/6 |       3/6 | 평점·단위 비교 개선, 의미 검색은 미완성   |
| 변형 불변성 검사                | 112/112 |   112/112 | 순서·성과 문구·숨김·반복에 대한 검사      |

현재 일반 질문의 로컬 p95는 약 0.20~0.22ms였다. DB/네트워크/LLM을 제외한 9개 이하 사례의 함수 실행이며, 운영 응답속도나 대용량 성능을 뜻하지 않는다. 이 값으로 성능 개선을 주장하지 않는다.

## 찾은 문제와 수정

1. 제목/태그가 실제 상황보다 강하게 매칭되는 문제: 실제 상황·제약·목표만 사용하도록 수정. 단어 추가나 가중치 미세 조정으로 질문을 외우게 하지 않음.
2. 명세와 다른 점수·실패 처리: 30/30/20/10/10으로 정리. 실제 행동 없는 경우 no_case, 조건이 다른 같은 행동은 reference.
3. 실제/가상 혼합: 기본 real, 명시적 demo 모드로 분리. 상세/도구 조회에서도 저장된 비교 모드 확인.
4. 한 결과만 보이는 문제: 대표 사례 외 다른 경과를 기존 카드에서 펼쳐 표시. 순서·후속 행동·중복 근거·인과 한계 안내.
5. 명시적 숫자·조건 차이: 평점 소수, 같은 주제의 인원/자원 수치, 시간/분 변환, 동일 주제의 있음/없음·가능/불가를 점수 외에 검사.
6. 화면에서 학생이 보완한 진행 상황이 미확인으로 남던 문제: 결과 생성 시 채워진 필드의 오래된 미확인 표식을 정리.

`cases.golden.ts`의 기존 기대 상태 일부도 최신 명세에 맞게 바뀌었다. 같은 행동의 사례가 전혀 없는 두 질문은 reference→no_case. 철회/후임/탈퇴처럼 상황 근거가 약하거나 긴급도가 다른 사례는 matched→reference. 사례 원문, 기대 후보 ID, 고정 벤치마크 22개/진단 6개의 정답은 바꾸지 않았다. 이 계약 변경을 정확도 향상 수치에 포함하지 않는다.

## 남은 실패 — 숨기지 않음

| 진단                   | 실패 내용                                                                 |
| ---------------------- | ------------------------------------------------------------------------- |
| `challenge-paraphrase` | “읽씹”과 “연락이 닿지 않음”의 의미를 충분히 연결하지 못함                 |
| `challenge-negation`   | “공부할 시간이 부족하지 않음”을 “시간 부족”에 가깝게 봄                   |
| `challenge-polarity`   | “업무를 줄일 수 없음”과 “줄일 수 있음”의 반대 의미를 충분히 구별하지 못함 |

키워드/글자 유사도만으로 범용 의미 이해를 보장할 수 없다. 단일 예시용 동의어 사전을 계속 늘리는 방식은 피한다. 다음 개선은 main의 모델 추출 결과에서 **문제 유형·확인된 제약의 대상/값/부정 여부**를 검증 가능한 형태로 받거나, 후보 소수에 의미 재평가를 적용하는 것이다. 그 전에는 새로운 카테고리별 실제 질문에 사람이 관련/무관/조건 충돌 정답을 붙여 평가 세트를 추가해야 한다. 모델을 추가해도 같은 고정 벤치마크와 별도의 미공개 질문을 함께 검증해야 한다.

## 재실행

저장소 루트 `/tmp/team4-context-publish`에서 실행한다. 소스와 공유 패키지를 바꾼 뒤에는 build를 먼저 한다.

```sh
corepack pnpm --filter @tutorial/shared build
corepack pnpm --filter @tutorial/server bench:matching --label next-dev --split development --baseline evaluation-results/matching-benchmark-final-dev.json
corepack pnpm --filter @tutorial/server bench:matching --label next-validation --split validation --baseline evaluation-results/matching-benchmark-final-validation.json
corepack pnpm --filter @tutorial/server bench:matching --suite challenge --label next-diagnostic --baseline evaluation-results/matching-benchmark-final-diagnostic.json
corepack pnpm --filter @tutorial/server test:matching
corepack pnpm test
```

비교 없이 새 결과만 보려면 `--baseline ...`을 생략한다. 보고서는 `server/evaluation-results/matching-benchmark-<label>.json`에 저장한다. 출력 경로는 Git 제외다. 기준 보고서는 이 로컬 체크아웃에 남아 있으며, 다른 컴퓨터에는 자동 복사되지 않는다. 다른 컴퓨터에서 실험할 때는 수정 전 `--label before`로 보고서를 먼저 만든다. 기존 label을 다시 쓰면 덮어쓰므로 매 실험에 새 label을 사용한다.

실패 목록은 JSON의 `failures` 출력 및 상세 `rows`에서 확인한다. 기준 보고서 대비 정답이던 질문이 틀리면 종료 코드 1로 처리한다. 진단 질문의 기존 미해결 실패는 보고서에 남기며, 실패가 있다는 이유만으로 일반 테스트 전체를 실패시키지는 않는다.

- 일반 질문 정의: `server/src/failfair/evaluation/fixtures/matching-benchmark.ts`
- 진단 질문 정의: `server/src/failfair/evaluation/fixtures/matching-challenges.ts`
- 실행기: `server/src/failfair/evaluation/matching-benchmark.ts`
- 변경 전 보고서: `matching-benchmark-baseline-dev.json`, `matching-benchmark-baseline-validation.json`
- 현재 보고서: `matching-benchmark-final-dev.json`, `matching-benchmark-final-validation.json`, `matching-benchmark-final-diagnostic.json`

## 기존 UI로 직접 실행

이번 확인용 서버는 `http://127.0.0.1:8797/`이다. 임시 로컬 DB는 `/tmp/team4-matching-bench-d1`이며 기존 개발 DB/운영 DB와 다르다. 모델 추출은 rule 모드로 고정했고 실제 API 키는 사용하지 않는다. 루트에서 재실행하려면:

```sh
corepack pnpm build:cloudflare
WRANGLER_LOG_PATH=/tmp/team4-matching-wrangler.log corepack pnpm exec wrangler d1 migrations apply DB --local --persist-to /tmp/team4-matching-bench-d1
WRANGLER_LOG_PATH=/tmp/team4-matching-wrangler.log corepack pnpm exec wrangler dev --local --ip 127.0.0.1 --port 8797 --persist-to /tmp/team4-matching-bench-d1 --var APP_ID:dev-app --var APP_SECRET:local-matching-only --var SIGNING_KEY:1111111111111111111111111111111111111111111111111111111111111111 --var FAILFAIR_CASE_SOURCE:demo --var MODEL_PROVIDER:rule
```

위 키는 로컬 테스트 전용 예시다. 운영에 복사하지 않는다. 서버가 이미 실행 중이면 다시 시작할 필요 없다. 종료하려면 실행한 터미널에서 Ctrl+C. 이미 사용한 DB에서 모델 설정을 바꿨다면 화면의 모델 설정도 확인한다.

브라우저에서 기존 학생 화면 → 카테고리 → 고민 → 상황 확인/수정 → 행동 확인 → 비교로 진행한다. API 없는 rule 모드는 자연어 추출이 단순하므로 H 이후를 시험할 때는 상황 확인 화면에서 정확한 값을 보완한다. 그 보완 없이 나온 결과를 Gemini 분류 성능으로 해석하면 안 된다.

## 실제 검증 기록

- 서버 테스트 **102개 통과**. 로컬 SQLite에서 H→M 함수·소유권·revision·추가 사례 영수증/복사 피드백/출처 변경 거부 검증 포함.
- 기존 main UI로 팀플·동아리 흐름 확인. 대표 사례, 다른 경과 펼치기, 순서/중복 안내, 가상 배지, 복구 영수증, “복사됨” 확인.
- 직접 추가한 미지원 행동은 의미 확인 전 비교 버튼이 비활성화되고, 확인 후 미지원 카드로 표시됨을 확인.
- 상황 확인에서 채운 진행 상황이 결과의 미확인 목록에서 빠짐을 확인.
- 타입 검사·lint·Cloudflare 빌드 통과. 운영 channel.works 배포 및 실제 Gemini 추출은 이번 검증 범위 밖.
