-- Run once in Neon SQL Editor before deploying this version.
CREATE TABLE IF NOT EXISTS user_notifications (
 id BIGSERIAL PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 actor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 album_id BIGINT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
 review_id BIGINT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('review','comment')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS user_notifications_user_recent_idx ON user_notifications(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS user_notifications_unread_idx ON user_notifications(user_id) WHERE read_at IS NULL;
