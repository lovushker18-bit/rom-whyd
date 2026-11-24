-- ROM v8: convert legacy ratings 0..10 into 1..90.
-- Existing 0 becomes 1; existing 10 becomes 90. Run ONCE.
BEGIN;
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_rating_check;
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_rating_check;
ALTER TABLE ratings ALTER COLUMN rating TYPE NUMERIC(5,1);
ALTER TABLE reviews ALTER COLUMN rating TYPE NUMERIC(5,1);
UPDATE ratings SET rating=GREATEST(1,LEAST(90,ROUND(rating*9))) WHERE rating<=10;
UPDATE reviews SET rating=GREATEST(1,LEAST(90,ROUND(rating*9))) WHERE rating<=10;
ALTER TABLE ratings ADD CONSTRAINT ratings_rating_check CHECK(rating BETWEEN 1 AND 90 AND rating=TRUNC(rating));
ALTER TABLE reviews ADD CONSTRAINT reviews_rating_check CHECK(rating BETWEEN 1 AND 90 AND rating=TRUNC(rating));
COMMIT;
