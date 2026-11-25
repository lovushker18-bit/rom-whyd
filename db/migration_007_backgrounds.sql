-- Run once in Neon SQL Editor. Does not delete existing data.
ALTER TABLE users ADD COLUMN IF NOT EXISTS background_theme TEXT NOT NULL DEFAULT 'none';
ALTER TABLE albums ADD COLUMN IF NOT EXISTS background_theme TEXT NOT NULL DEFAULT 'none';
