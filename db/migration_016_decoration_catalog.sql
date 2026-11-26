-- Run once in Neon SQL Editor.
CREATE TABLE IF NOT EXISTS avatar_decorations (
 id BIGSERIAL PRIMARY KEY,
 name VARCHAR(80) NOT NULL,
 description VARCHAR(300) NOT NULL DEFAULT '',
 image_url TEXT NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Existing cat ears stay available after the upgrade.
INSERT INTO avatar_decorations(name,description,image_url,active)
SELECT 'Кошачьи ушки','Немного милоты даже для самых серьёзных музыкальных критиков.','/decorations/cat-ears-pink.png',TRUE
WHERE NOT EXISTS (SELECT 1 FROM avatar_decorations WHERE image_url='/decorations/cat-ears-pink.png');
-- Convert the previous static selection to its catalog ID.
UPDATE users SET avatar_decoration=(SELECT id::text FROM avatar_decorations WHERE image_url='/decorations/cat-ears-pink.png' LIMIT 1) WHERE avatar_decoration='cat-ears-pink';
