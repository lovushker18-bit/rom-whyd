-- ROM: one score per track for multi-track releases, optional anonymous reviews.
-- Safe to run once before deploying the updated API.
BEGIN;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS track_ratings (
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 album_id BIGINT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
 track_id BIGINT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
 rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 90),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,track_id)
);
CREATE INDEX IF NOT EXISTS idx_track_ratings_album_user ON track_ratings(album_id,user_id);
COMMIT;
