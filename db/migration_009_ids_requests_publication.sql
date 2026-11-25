-- ROM v26: execute ONCE in Neon SQL Editor before deploying new API.
-- Keeps users.id and relationships intact. Adds separate six-digit public IDs.
BEGIN;
CREATE SEQUENCE IF NOT EXISTS rom_public_id_seq AS INTEGER MINVALUE 100000 MAXVALUE 999999 START 100000 NO CYCLE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id INTEGER;
ALTER TABLE users ALTER COLUMN public_id SET DEFAULT nextval('rom_public_id_seq');
UPDATE users SET public_id=nextval('rom_public_id_seq') WHERE public_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_unique ON users(public_id);
ALTER TABLE users ADD CONSTRAINT users_public_id_six_digits CHECK (public_id BETWEEN 100000 AND 999999);
ALTER TABLE users ALTER COLUMN public_id SET NOT NULL;
-- Re-synchronize after filling existing records; preserves sequence on re-runs.
SELECT setval('rom_public_id_seq',GREATEST((SELECT last_value FROM rom_public_id_seq),(SELECT MAX(public_id) FROM users)),true);
CREATE TABLE IF NOT EXISTS username_change_requests (
 id BIGSERIAL PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 requested_username VARCHAR(24) NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_at TIMESTAMPTZ,
 reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS username_change_one_pending ON username_change_requests(user_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS username_change_status_idx ON username_change_requests(status,created_at DESC);
ALTER TABLE track_submissions ADD COLUMN IF NOT EXISTS published_album_id BIGINT REFERENCES albums(id) ON DELETE SET NULL;
COMMIT;
