-- ROM: optional external music platform links. Run once in Neon before deploying.
ALTER TABLE albums ADD COLUMN IF NOT EXISTS platform_links JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE track_submissions ADD COLUMN IF NOT EXISTS platform_links JSONB NOT NULL DEFAULT '{}'::jsonb;
