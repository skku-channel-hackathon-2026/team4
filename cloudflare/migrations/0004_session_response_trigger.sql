-- Vercel HTTP D1 adapters expose prepare/bind/run/first/all, but not batch.
-- A single conditional UPDATE and its trigger are one SQLite transaction.
ALTER TABLE failfair_sessions ADD COLUMN pending_response_json TEXT
  CHECK (pending_response_json IS NULL OR json_valid(pending_response_json));

CREATE TRIGGER failfair_session_response_commit
AFTER UPDATE ON failfair_sessions
WHEN NEW.pending_response_json IS NOT NULL
  AND NEW.last_request_id IS NOT NULL
  AND NEW.revision = OLD.revision + 1
BEGIN
  INSERT INTO failfair_requests (session_id, request_id, response_json, created_at)
  VALUES (NEW.id, NEW.last_request_id, NEW.pending_response_json, NEW.updated_at);
END;
