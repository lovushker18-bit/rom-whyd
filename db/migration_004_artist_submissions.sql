-- Run once in Neon SQL Editor. Existing data is preserved.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_artist BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS track_submissions (
 id BIGSERIAL PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title VARCHAR(150) NOT NULL,
 artist_name VARCHAR(120) NOT NULL,
 audio_url TEXT NOT NULL,
 cover_url TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL DEFAULT '',
 status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_at TIMESTAMPTZ,
 reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS track_submissions_user_idx ON track_submissions(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS track_submissions_status_idx ON track_submissions(status,created_at DESC);
