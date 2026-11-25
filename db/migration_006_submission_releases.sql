-- ROM v14: Run once in Neon SQL Editor. Existing submissions are preserved.
ALTER TABLE track_submissions ADD COLUMN IF NOT EXISTS release_type TEXT NOT NULL DEFAULT 'single';
ALTER TABLE track_submissions ADD COLUMN IF NOT EXISTS release_date TEXT NOT NULL DEFAULT '';
ALTER TABLE track_submissions ADD COLUMN IF NOT EXISTS tracks_json JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE track_submissions SET tracks_json=jsonb_build_array(jsonb_build_object('title',title,'featuring',featuring,'audio_url',audio_url)) WHERE tracks_json='[]'::jsonb;
