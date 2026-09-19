# 푸시 전 최종 매칭 점검

2026-09-19, 로컬 `kyu_beom-senior-matching`에서 수행했다. 이번 턴에는 푸시·PR·운영 배포를 하지 않았다. 기존 5개 항목 최대 20점, 관련성 문턱, 프롬프트는 변경하지 않았다. 모델 학습/파인튜닝/API 호출도 없다.

## 점검 설계

기존 일반 22개, 편중 대조 18개, 어려운 표현 6개를 회귀 세트로 유지했다. 별도로 자료 접근성·실험 데이터 복구·행사 장비 이동 상황을 만들고, 알고리즘 수정 전에 최종 점검 파일과 기대 조건을 고정했다.

새 점검은 3개 상황에서 표현 변경/유형 누락/목표 누락/상황만 입력한 순위 검사 12개와 구조적 계약 검사 27개, 총 39개다. 39명의 독립 사용자 평가가 아니다. 기대 정답과 가중치를 맞춰 바꾸지 않았다.

고정 파일: `server/src/failfair/evaluation/final-audit.ts`
수정 전후 동일 SHA-256: `f86c975c557ad16d5bc0fc2bd965a3a4c66087f61798820209e2fe8ddaacb911`

## 수정한 두 결함

### 선택하지 않은 행동이 점수에 영향

행동으로 후보를 거르기 전에 전체 카테고리 문서로 TF-IDF를 계산하고 있었다. 따라서 선택하지 않은 행동의 사례를 추가해도 선택한 행동의 원시 유사도와 일부 점수가 달라졌다. 새 세 상황 모두에서 재현했다. 이번 점검에서는 대표 순위 역전까지 관찰한 것은 아니다.

이제 해당 행동을 실제 수행한 사례로 먼저 제한하고 그 집합으로만 문서 통계와 점수를 계산한다. `rankCases`와 실제 카드 생성 `matchActions` 모두 같은 경로를 사용한다. 행동별 후보 집합이 달라 점수도 상대적이며 서로 다른 행동 사이의 절대 비교용 점수가 아니다.

### 모순된 기록에 일치 가점

같은 선배 제약에 ‘가용 인원 2명’과 ‘가용 인원 5명’이 함께 있으면, 학생의 2명 조건과 일치하는 한 줄만 보고 +1의 원시 근거를 주고 있었다.

이제 비교 가능한 동일 주제에서 일치와 충돌이 동시에 있으면 그 조건의 기여를 0으로 둔다. 충돌 안내와 reference 표시는 유지한다. 시점이 구분되지 않은 상충 기록 중 하나를 임의로 정답 취급하지 않는다. 다른 주제의 조건이 추가된 경우에는 일치를 무효화하지 않는다. 예산 수치·순서 변경으로도 회귀 테스트를 추가했다.

## 결과

| 세트                       | 수정 전 | 수정 후 |
| -------------------------- | ------: | ------: |
| 신규 순위 검사             |   12/12 |   12/12 |
| 신규 구조적 계약 검사      |   21/27 |   27/27 |
| 기존 일반 평가             |   22/22 |   22/22 |
| 기존 편중 대조             |   18/18 |   18/18 |
| 기존 어려운 표현           |     5/6 |     5/6 |
| 기존 46개 질문의 변형 검사 | 184/184 | 184/184 |

전체 서버 테스트 112개, 전체 타입 검사, lint, 포맷 검사, Cloudflare 빌드 통과. 이번 마지막 수정에서는 실제 UI 동작이나 Gemini 추출 성능을 새로 평가하지 않았다. 검사 서버는 수정 코드를 로드하도록 재시작했다.

## 해석과 남은 한계

과적합이 없음을 증명한 결과는 아니다. 같은 제작자가 작성한 합성 세트이고, 신규 세트도 결함 확인 후 수정·재검증에 사용했으므로 외부 블라인드 평가가 아니다. 이번 변경은 배점 탐색이나 특정 사례 ID/문장 분기 대신 카테고리와 무관하게 성립하는 후보 분리·모순 처리 규칙으로 제한했다.

‘읽씹’과 ‘연락이 닿지 않음’의 바꿔쓰기 오류 한 건은 여전히 남는다. 이를 통과시키려는 동의어 사전이나 예외 처리를 넣지 않았다. 문자열 유사도, 단순 조건 비교만으로 범용 의미 이해를 보장할 수 없다. 실제 팀원이 모은 새 표현을 별도 평가해야 한다.

작업 기반 main은 기존 문서의 `d316e37`이다. PR #18 병합 이후 최신 main 통합 검증까지 끝났다는 뜻은 아니다. 푸시/PR 시 최신 main과의 충돌·통합 검사는 별도로 필요하다.

## 재실행 및 근거 파일

서버 폴더에서:

```sh
node --import tsx src/failfair/evaluation/final-audit.ts next-review
node --import tsx src/failfair/evaluation/matching-benchmark.ts --label next-standard --baseline evaluation-results/matching-benchmark-release-standard.json
node --import tsx src/failfair/evaluation/matching-benchmark.ts --suite distributed --label next-distributed --baseline evaluation-results/matching-benchmark-release-distributed.json
node --import tsx src/failfair/evaluation/matching-benchmark.ts --suite challenge --label next-challenge --baseline evaluation-results/matching-benchmark-release-challenge.json
node --import tsx --test src/*.test.ts src/failfair/*.test.ts
```

이번 근거는 Git 제외 경로 `server/evaluation-results/`에 보관했다:

- `final-audit-before.json`, `final-audit-after.json`
- `matching-benchmark-release-standard.json`
- `matching-benchmark-release-distributed.json`
- `matching-benchmark-release-challenge.json`

최종 점검은 하나라도 실패하면 종료 코드 1이다. 기존 벤치마크는 알려진 진단 실패를 기록하고, 기준 대비 퇴행이나 변형 검사 실패 시 종료 코드 1이다. 파일명이 같은 label을 재사용하면 덮어쓰므로 새 이름을 사용한다.
