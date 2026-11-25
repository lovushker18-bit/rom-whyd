-- Run once in Neon SQL Editor. Existing tables and data are preserved.
CREATE TABLE IF NOT EXISTS news_posts (
 id BIGSERIAL PRIMARY KEY,
 title VARCHAR(180) NOT NULL,
 summary VARCHAR(500) NOT NULL DEFAULT '',
 body TEXT NOT NULL,
 cover_url TEXT NOT NULL DEFAULT '',
 published BOOLEAN NOT NULL DEFAULT FALSE,
 author_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS news_posts_published_idx ON news_posts(published,created_at DESC);
