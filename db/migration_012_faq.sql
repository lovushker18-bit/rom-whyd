-- Run once in Neon SQL Editor (keeps all existing data).
CREATE TABLE IF NOT EXISTS faq_entries (
 id BIGSERIAL PRIMARY KEY,
 category TEXT NOT NULL CHECK(category IN ('user','artist')),
 question VARCHAR(250) NOT NULL,
 answer TEXT NOT NULL CHECK(char_length(answer) BETWEEN 1 AND 5000),
 sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS faq_entries_category_order_idx ON faq_entries(category,sort_order,id);
