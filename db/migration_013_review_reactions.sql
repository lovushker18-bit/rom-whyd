-- Run once in Neon SQL Editor before deploying the new review reactions UI.
-- Existing comments table is part of the original ROM schema.
CREATE TABLE IF NOT EXISTS review_reactions (
 review_id BIGINT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 reaction SMALLINT NOT NULL CHECK (reaction IN (-1,1)),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (review_id,user_id)
);
CREATE INDEX IF NOT EXISTS review_reactions_review_idx ON review_reactions(review_id);
CREATE TABLE IF NOT EXISTS comments (
 id BIGSERIAL PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 review_id BIGINT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
 parent_id BIGINT REFERENCES comments(id),
 body TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS comments_review_idx ON comments(review_id);
