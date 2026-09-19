-- PR #27 and #28 used the same 0004 filename with different columns/triggers.
-- Reverting code does not revert D1 migration history. Never reuse either column:
-- this new migration works after either version of 0004, without deleting data.
ALTER TABLE failfair_sessions ADD COLUMN commit_response_json TEXT
  CHECK (commit_response_json IS NULL OR json_valid(commit_response_json));

DROP TRIGGER IF EXISTS failfair_session_response_commit;
DROP TRIGGER IF EXISTS failfair_session_response;

CREATE TRIGGER failfair_session_response_v2
AFTER UPDATE OF commit_response_json ON failfair_sessions
WHEN NEW.last_request_id IS NOT NULL AND NEW.commit_response_json IS NOT NULL
BEGIN
  INSERT INTO failfair_requests (session_id, request_id, response_json, created_at)
  VALUES (NEW.id, NEW.last_request_id, NEW.commit_response_json, NEW.updated_at);
END;
