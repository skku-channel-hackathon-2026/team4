-- HTTP DB adapters support individual statements, but not D1 batch().
-- A trigger keeps session changes and idempotent responses atomic in either runtime.
ALTER TABLE failfair_sessions ADD COLUMN last_response_json TEXT
  CHECK (last_response_json IS NULL OR json_valid(last_response_json));

CREATE TRIGGER failfair_session_response
AFTER UPDATE OF last_response_json ON failfair_sessions
WHEN NEW.last_request_id IS NOT NULL AND NEW.last_response_json IS NOT NULL
BEGIN
  INSERT INTO failfair_requests (session_id, request_id, response_json, created_at)
  VALUES (NEW.id, NEW.last_request_id, NEW.last_response_json, NEW.updated_at);
END;
