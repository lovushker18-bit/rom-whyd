-- Run ONCE in Neon SQL Editor before deploying this build. Existing requests remain intact.
ALTER TABLE help_requests ADD COLUMN IF NOT EXISTS admin_reply TEXT;
ALTER TABLE help_requests ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
ALTER TABLE help_requests ADD COLUMN IF NOT EXISTS user_followup TEXT;
ALTER TABLE help_requests ADD COLUMN IF NOT EXISTS followed_up_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS help_reply_notifications (
 id BIGSERIAL PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 request_id BIGINT NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 read_at TIMESTAMPTZ,
 UNIQUE(request_id)
);
CREATE INDEX IF NOT EXISTS help_reply_notifications_unread_idx ON help_reply_notifications(user_id) WHERE read_at IS NULL;
