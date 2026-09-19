# 망한 선배 사례 데이터

사례 원문은 `packages/shared/src/cases.ts`의 `DEMO_CASES`에, 검색 정답 기준은
`packages/shared/src/cases.golden.ts`에 있다. 둘 다 D(콘텐츠) 담당이 소유한다.
`server/src/failfair/golden.test.ts`가 두 파일을 함께 검사하며 `pnpm test`에 포함된다.

사례를 읽는 경로는 아직 D1이 아니라 `app_records`다 (`case.repository.ts`).
`0002_failfair.sql`의 `failfair_cases` 테이블로 옮기는 것은 B의 작업이며,
옮긴 뒤에도 이 파일들은 그대로 시드로 쓸 수 있다.

## 사례를 추가할 때

1. **행동 태그는 `ACTION_TAGS`에 있는 값만 쓴다.** 목록에 없는 태그를 쓰면 학생이 그 행동을
   고를 수 없어 사례가 영영 검색되지 않는다. 새 태그가 필요하면 `failfair.ts`를 먼저 고치고
   C에게 알린다. 테스트가 이걸 검사한다.
2. **`constraints`는 스네이크 케이스 태그가 아니라 한국어 문장으로 쓴다.** `scoreCase`가
   학생이 말한 제약과 토큰 겹침으로 비교하기 때문이다. `team_size_2_3`은 아무것도 매칭되지 않고
   "가동 인원 두 명"은 매칭된다.
3. **`urgency`는 `today` / `week` / `later` / `unknown` 넷뿐이다.** 시간 단위 상황은 `today`,
   며칠은 `week`, 주 단위 이상은 `later`다.
4. **결과는 "이 행동을 하면 이렇게 된다"가 아니라 "이 선배는 이렇게 했고 이런 일이 있었다"로 쓴다**(§6.2).
5. **`receipt.cost`와, `outcome.unresolved` 또는 `receipt.status !== "resolved"` 중 하나는 반드시 채운다.**
   테스트가 강제한다. 성공담만 모이면 이 서비스의 전제가 무너진다.
6. **`conditions`에는 "이 사례가 성립한 전제"를 쓴다.** §5.3의 차이 표시에 그대로 쓰인다.
7. 실명, 학번, 특정 교수·과목명은 넣지 않는다.
8. `id`는 한 번 정하면 바꾸지 않는다. 테스트와 골든 세트가 참조한다.

## 현재 사례 20건

기본 세 갈래만으로는 §14 검증 기준을 통과하지 못해 카테고리마다 엣지 케이스를 함께 넣었다.
아래 표의 "존재 이유"가 붙은 사례를 지우면 골든 테스트가 깨진다.

### team_project — 발표 직전 팀원 연락 두절

| id                         | 행동                         | 존재 이유                            |
| -------------------------- | ---------------------------- | ------------------------------------ |
| `team-solo-night`          | solo_completion              | 기본                                 |
| `team-inform-professor`    | inform_professor             | 기본                                 |
| `team-reduce-scope`        | reduce_scope_reassign        | 기본                                 |
| `team-inform-late-refused` | inform_professor             | **상반된 결과** — 세 시간 전, 거절됨 |
| `team-solo-then-inform`    | solo → inform → reduce_scope | **다행동** (§5.1)                    |
| `team-reduce-scope-early`  | reduce_scope_reassign        | **조건 불일치** — 마감 닷새, 네 명   |
| (사례 없음)                | request_member_removal       | **사례 0건** 검증용 (§5.3)           |

### grades — 시험 이후 성적 회복

| id                              | 행동                           | 존재 이유                            |
| ------------------------------- | ------------------------------ | ------------------------------------ |
| `grades-ask-ta`                 | ask_help → change_study_method | 기본                                 |
| `grades-change-method-6weeks`   | change_study_method            | 기본 — 여섯 주 남음, 회복            |
| `grades-withdraw-one-course`    | replan_courses                 | 기본 — 둘 중 하나만 철회             |
| `grades-change-method-too-late` | change_study_method            | **상반된 결과** — 닷새 남기고 바꿔 F |
| `grades-ask-then-withdraw`      | ask → inform → replan          | **다행동** (§5.1)                    |
| `grades-early-habit-change`     | change_study_method + ask_help | **조건 불일치** — 3주차, 절대평가    |
| `grades-check-weights`          | inform_professor               | 배점 확인만으로 판단이 바뀐 사례     |
| (사례 없음)                     | request_grade_review           | **사례 0건** 검증용 (§5.3)           |

### club — 동아리 역할 부담

| id                               | 행동                         | 존재 이유                            |
| -------------------------------- | ---------------------------- | ------------------------------------ |
| `club-reduce-role`               | reduce_role → share_workload | 기본                                 |
| `club-share-workload-table`      | share_workload               | 기본 — 실무가 관리로 바뀜            |
| `club-quit-midterm`              | discuss_leaving → recruit    | 기본 — 학기 중 하차                  |
| `club-reduce-role-program-ended` | reduce_role                  | **상반된 결과** — 프로그램이 없어짐  |
| `club-reduce-then-quit`          | reduce → recruit → leaving   | **다행동** — 세 단계 (§5.1)          |
| `club-handover-after-event`      | reduce_role + recruit        | **조건 불일치** — 행사 끝난 뒤, 여유 |
| `club-ask-ob`                    | ask_help                     | 부담의 종류가 안 줄어든 사례         |
| (사례 없음)                      | request_member_removal       | 팀플과 공유하는 0건 태그             |

## 설계서와 구현이 아직 다른 곳

사례를 붙이면서 확인된 것들이다. 데이터로는 해결되지 않으므로 C가 판단해야 한다.

**§5.3의 "연결할 사례가 아직 없습니다"가 현재 구현에서는 도달할 수 없다.**
`buildResult`는 `rankCases`가 빈 배열일 때만 `no_case`를 낸다. 그런데 `scoreCase`는
`problemType`만 같아도 30점을 주므로, 같은 카테고리에 사례가 하나라도 있으면 점수가 0이 아니다.
그래서 그 행동을 한 선배가 아무도 없어도 결과는 `reference`(참고 사례)로 나온다.
골든 테스트는 현재 동작대로 `reference`를 기대하되, 그중 어느 것도 `actionMatched`가
아님을 함께 검사한다. 화면에서 "이 행동을 한 선배는 아직 없어요"를 구분해 보여줄지는 미정이다.

**§5.1의 "동일 사례임을 명시하고 독립적인 근거처럼 세지 않는다"가 구현돼 있지 않다.**
`matchActions`는 행동마다 1순위 하나씩만 돌려주고 사례가 겹치는지 보지 않는다.
`team-solo-then-inform`처럼 한 사례에 행동이 여럿 있으면 두 카드에 같은 사례가 뜰 수 있는데,
지금은 표시가 없다. 결과 조립 단계에서 처리가 필요하다.

**상반된 결과를 한 화면에 함께 보여주는 경로가 없다.** §5.3은 결과가 엇갈리는 사례를
함께 제공하라고 하는데 `buildResult`는 `ranked[0]` 하나만 쓴다. 데이터에는 상반 쌍을
세 카테고리 모두 넣어 두었으므로, 2순위를 함께 내보낼지 C가 정하면 바로 쓸 수 있다.
