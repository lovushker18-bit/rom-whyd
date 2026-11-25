-- Run once in Neon SQL Editor before deploying the new Help page.
CREATE TABLE IF NOT EXISTS help_requests (
 id BIGSERIAL PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 subject VARCHAR(50) NOT NULL CHECK (char_length(trim(subject)) BETWEEN 1 AND 50),
 message VARCHAR(300) NOT NULL CHECK (char_length(trim(message)) BETWEEN 1 AND 300),
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','closed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS help_requests_status_created_idx ON help_requests(status,created_at DESC);
