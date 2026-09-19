-- 망한 선배 박람회 v2 §9 데이터 모델 제안.
--
-- 상태: 제안. 현재 코드는 이 테이블을 아직 쓰지 않고 `app_records`에 JSON으로 저장한다
-- (server/src/failfair/case.repository.ts, session.service.ts). B가 저장소 구현을 이 테이블로
-- 옮길 때 원격 적용을 운영진에게 요청한다. 적용 전에는 의존 코드를 main에 합치지 않는다.
--
-- 로컬에서는 `corepack pnpm db:migrate:local`로 미리 적용해 볼 수 있다.

CREATE TABLE IF NOT EXISTS failfair_cases (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',        -- draft | approved | hidden
  source_type TEXT NOT NULL DEFAULT 'real',    -- real | demo
  title TEXT NOT NULL,
  problem_type TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'unknown',
  situation_json TEXT NOT NULL CHECK (json_valid(situation_json)),
  action_steps_json TEXT NOT NULL CHECK (json_valid(action_steps_json)),
  outcome_json TEXT NOT NULL CHECK (json_valid(outcome_json)),
  receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
  conditions_json TEXT NOT NULL CHECK (json_valid(conditions_json)),
  tags_json TEXT NOT NULL CHECK (json_valid(tags_json)),
  version INTEGER NOT NULL DEFAULT 1,
  author_manager_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_failfair_cases_category_status
  ON failfair_cases (category, status);

CREATE TABLE IF NOT EXISTS failfair_tools (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES failfair_cases (id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  usage_note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS failfair_sessions (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  category TEXT NOT NULL,
  state TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  situation_json TEXT NOT NULL CHECK (json_valid(situation_json)),
  confirmed_revision INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_failfair_sessions_owner
  ON failfair_sessions (channel_id, owner_id);

CREATE TABLE IF NOT EXISTS failfair_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES failfair_sessions (id),
  request_id TEXT,
  role TEXT NOT NULL,                          -- student | assistant
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_failfair_messages_session
  ON failfair_messages (session_id);

CREATE TABLE IF NOT EXISTS failfair_actions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES failfair_sessions (id),
  situation_revision INTEGER NOT NULL,
  label TEXT NOT NULL,
  action_tag TEXT,
  origin TEXT NOT NULL,                        -- student | suggested
  confirmed INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS failfair_results (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES failfair_sessions (id),
  situation_revision INTEGER NOT NULL,
  action_id TEXT NOT NULL,
  case_id TEXT,
  case_version INTEGER,
  match_json TEXT NOT NULL CHECK (json_valid(match_json))
);

CREATE TABLE IF NOT EXISTS failfair_feedback (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  result_id TEXT NOT NULL,
  event TEXT NOT NULL,                         -- helpful | not_helpful | tool_copied
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS failfair_requests (
  session_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL,                        -- pending | done | failed
  response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, request_id)
);
