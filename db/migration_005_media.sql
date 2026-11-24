-- Execute ONCE in Neon SQL Editor after migration_004. Existing rows are preserved.
ALTER TABLE albums ADD COLUMN IF NOT EXISTS featuring TEXT NOT NULL DEFAULT '';
ALTER TABLE albums ADD COLUMN IF NOT EXISTS audio_url TEXT NOT NULL DEFAULT '';
ALTER TABLE track_submissions ADD COLUMN IF NOT EXISTS featuring TEXT NOT NULL DEFAULT '';
