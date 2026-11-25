-- ROM v18: run once in Neon SQL Editor. No existing data removed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS background_color VARCHAR(7) NOT NULL DEFAULT '#8bff72';
ALTER TABLE albums ADD COLUMN IF NOT EXISTS background_color VARCHAR(7) NOT NULL DEFAULT '#8bff72';
ALTER TABLE track_submissions ADD COLUMN IF NOT EXISTS background_color VARCHAR(7) NOT NULL DEFAULT '#8bff72';
