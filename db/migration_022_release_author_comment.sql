-- Optional release author comment; safe to run once or repeatedly.
ALTER TABLE albums ADD COLUMN IF NOT EXISTS author_comment TEXT NOT NULL DEFAULT '';
ALTER TABLE track_submissions ADD COLUMN IF NOT EXISTS author_comment TEXT NOT NULL DEFAULT '';
