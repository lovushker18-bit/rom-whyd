-- Run once in Neon SQL Editor before deploying this version.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_bg_color VARCHAR(7) NOT NULL DEFAULT '#555555';
ALTER TABLE avatar_decorations ADD COLUMN IF NOT EXISTS reviews_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE avatar_decorations DROP CONSTRAINT IF EXISTS avatar_decorations_reviews_required_check;
ALTER TABLE avatar_decorations ADD CONSTRAINT avatar_decorations_reviews_required_check CHECK (reviews_required BETWEEN 0 AND 10000);
-- Existing decorations remain unlocked; set 5 in admin when adding the first secret decoration.

INSERT INTO avatar_decorations(name,description,image_url,reviews_required,active)
SELECT 'Пятая передача','Пять рецензий — и музыка выходит на новую передачу.','/decorations/five-reviews.png',5,TRUE
WHERE NOT EXISTS (SELECT 1 FROM avatar_decorations WHERE image_url='/decorations/five-reviews.png');
