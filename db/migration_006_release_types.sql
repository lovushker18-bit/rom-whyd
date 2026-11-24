-- Run once in Neon SQL Editor after migration_005_media.sql. Keeps existing data.
ALTER TABLE albums ADD COLUMN IF NOT EXISTS release_type TEXT NOT NULL DEFAULT 'album';
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS featuring TEXT NOT NULL DEFAULT '';
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS audio_url TEXT NOT NULL DEFAULT '';
-- Preserve audio from older one-track releases, if present.
UPDATE tracks t SET audio_url=a.audio_url FROM albums a WHERE t.album_id=a.id AND t.audio_url='' AND t.track_number=1 AND a.audio_url<>'';
