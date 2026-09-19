-- 망한 선배 박람회 저장소.
--
-- app_records(JSON key-value)에 통째로 넣던 사례·세션·SOS·피드백을 종류별 테이블로 옮긴다.
-- 필터·정렬·잠금에 쓰는 값만 컬럼으로 두고, 원문은 공유 Zod 스키마(packages/shared)로
-- 검증한 JSON을 body_json에 넣는다. 항상 한 행 = 한 개체이므로 동시에 써도 서로를 덮어쓰지 않는다.
--
-- app_records는 그대로 둔다. 모델 설정(`failfair:model`)과 사례 이전 표식이 계속 쓴다.
-- 되돌릴 때 지울 것도 없다. 옛 코드는 app_records만 읽으므로 이 테이블이 있어도 그대로 돈다.
--
-- 예전 제안 0002_failfair.sql을 로컬에 적용해 둔 경우 초기화가 필요하다:
--   rm -rf .wrangler/state && corepack pnpm db:migrate:local
-- IF NOT EXISTS를 일부러 쓰지 않는다. 옛 테이블이 남아 있으면 조용히 어긋나는 대신 여기서 실패해야 한다.

-- 선배 사례 (CaseSchema). 번들의 가상 사례 20건은 여기 넣지 않고 읽을 때 합친다.
-- 가상 사례를 숨기면 같은 id로 여기 한 행이 생겨 번들 쪽을 덮는다.
CREATE TABLE failfair_cases (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,                       -- grades | team_project | club
  status TEXT NOT NULL,                         -- draft | approved | hidden
  source_type TEXT NOT NULL,                    -- real | demo
  author_manager_id TEXT,                       -- 연락 허용한 선배의 채널톡 매니저 ID
  allow_contact INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  body_json TEXT NOT NULL CHECK (json_valid(body_json)),
  created_at INTEGER NOT NULL,                  -- epoch ms (Case.createdAt)
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_failfair_cases_category_status
  ON failfair_cases (category, status);

-- 학생 대화 세션. 대화·행동·결과는 항상 통째로 읽고 쓰므로 body_json 하나에 둔다.
-- revision이 낙관적 잠금이다: UPDATE ... WHERE revision = ? 가 0행이면 남이 먼저 바꾼 것.
CREATE TABLE failfair_sessions (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,                       -- 채널톡 매니저 ID. 소유자만 읽는다
  category TEXT NOT NULL,
  state TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  last_request_id TEXT,                         -- 이 revision을 만든 요청. 응답 기록이 같은 트랜잭션에서 이 값을 확인한다
  body_json TEXT NOT NULL CHECK (json_valid(body_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_failfair_sessions_owner
  ON failfair_sessions (channel_id, owner_id, updated_at);

-- 변경 요청의 멱등성. 같은 requestId 재전송은 여기 저장된 응답을 그대로 돌려준다.
-- 세션 UPDATE와 같은 batch(트랜잭션)에서만 쓰므로, 둘 중 하나만 남는 일이 없다.
CREATE TABLE failfair_requests (
  session_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, request_id)
);

-- 도움 됨·도구 복사 신호. request_id가 기본키라 같은 클릭이 두 번 쌓이지 않는다.
CREATE TABLE failfair_feedback (
  request_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  result_id TEXT NOT NULL,
  case_id TEXT,                                 -- 결과 카드에 연결된 사례. 사례별 집계용
  event TEXT NOT NULL,                          -- helpful | not_helpful | tool_copied
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_failfair_feedback_case
  ON failfair_feedback (case_id, event);

-- SOS 요청 (SosRequestSchema). (채널·사례·새내기)당 대기 중 요청은 하나뿐이다.
-- 거절·수락된 요청은 이력으로 남고, 거절당한 뒤에는 새 요청을 다시 넣을 수 있다.
CREATE TABLE failfair_sos (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  student_manager_id TEXT NOT NULL,
  senior_manager_id TEXT NOT NULL,
  status TEXT NOT NULL,                         -- pending | accepted | declined
  request_id TEXT,                              -- 화면이 만든 전송 단위 ID. 응답만 잃은 재전송을 새 요청과 구분한다
  body_json TEXT NOT NULL CHECK (json_valid(body_json)),
  created_at INTEGER NOT NULL,
  responded_at INTEGER
);
CREATE UNIQUE INDEX idx_failfair_sos_request
  ON failfair_sos (channel_id, request_id);
CREATE UNIQUE INDEX idx_failfair_sos_pending
  ON failfair_sos (channel_id, case_id, student_manager_id)
  WHERE status = 'pending';
CREATE INDEX idx_failfair_sos_senior
  ON failfair_sos (channel_id, senior_manager_id, created_at);
CREATE INDEX idx_failfair_sos_student
  ON failfair_sos (channel_id, student_manager_id, created_at);
