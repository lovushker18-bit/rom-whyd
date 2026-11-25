-- ROM v27: RANDOM, UNIQUE six-digit public IDs (100000..999999).
-- Run ONCE on the existing Neon database AFTER migration_009.
-- Does not alter users.id, sessions, reviews, ratings, or foreign keys.
-- On repeat runs it retains already randomized public IDs.
BEGIN;
LOCK TABLE users IN ACCESS EXCLUSIVE MODE;

-- Serialization plus a unique index prevent duplicate IDs even under concurrent registration.
CREATE OR REPLACE FUNCTION rom_random_public_id()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  candidate integer;
  attempt integer := 0;
BEGIN
  -- New user registration waits if another transaction is assigning an ID.
  PERFORM pg_advisory_xact_lock(270026, 10);
  LOOP
    candidate := 100000 + FLOOR(random() * 900000)::integer;
    IF NOT EXISTS (SELECT 1 FROM users WHERE public_id = candidate) THEN
      RETURN candidate;
    END IF;
    attempt := attempt + 1;
    IF attempt > 100000 THEN
      RAISE EXCEPTION 'No available random six-digit public IDs';
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  old_default text;
  rec record;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid)
    INTO old_default
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE n.nspname = current_schema()
    AND c.relname = 'users' AND a.attname = 'public_id';

  IF old_default IS NULL THEN
    RAISE EXCEPTION 'public_id not found. Run migration_009 first.';
  END IF;

  IF old_default NOT LIKE '%rom_random_public_id%' THEN
    -- The old sequential public IDs are replaced once; internal users.id never changes.
    ALTER TABLE users ALTER COLUMN public_id DROP NOT NULL;
    UPDATE users SET public_id = NULL;
    FOR rec IN SELECT id FROM users ORDER BY id LOOP
      UPDATE users SET public_id = rom_random_public_id() WHERE id = rec.id;
    END LOOP;
    ALTER TABLE users ALTER COLUMN public_id SET NOT NULL;
  END IF;
END;
$$;

ALTER TABLE users ALTER COLUMN public_id SET DEFAULT rom_random_public_id();
CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_unique ON users (public_id);
COMMIT;

-- Optional check after running:
-- SELECT username, public_id FROM users ORDER BY id;
