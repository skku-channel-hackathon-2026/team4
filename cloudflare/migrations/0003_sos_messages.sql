-- SOS 대화. 선배가 수락한 뒤 새내기와 선배가 앱 안에서 주고받는 말.
--
-- 채널톡 1:1 DM은 앱 권한(findOrCreateDirectChat 등)이 있어야 열리므로,
-- 권한과 무관하게 항상 이어지는 자리로 이 표를 둔다. 한 행 = 말 하나.
-- request_id는 화면이 만든 전송 단위 ID라 같은 클릭이 두 번 쌓이지 않는다.
CREATE TABLE failfair_sos_messages (
  id TEXT PRIMARY KEY,
  sos_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  sender_manager_id TEXT NOT NULL,
  role TEXT NOT NULL,                           -- student | senior
  request_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_failfair_sos_messages_request
  ON failfair_sos_messages (sos_id, request_id);
CREATE INDEX idx_failfair_sos_messages_thread
  ON failfair_sos_messages (sos_id, created_at, id);
