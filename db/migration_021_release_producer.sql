-- ROM: optional release-level producer credit (prod. by)
ALTER TABLE albums ADD COLUMN IF NOT EXISTS producer VARCHAR(150) NOT NULL DEFAULT '';
ALTER TABLE track_submissions ADD COLUMN IF NOT EXISTS producer VARCHAR(150) NOT NULL DEFAULT '';
