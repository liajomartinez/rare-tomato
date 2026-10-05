-- Owner decision (2026-10-04): there is no "locked" rule state any more.
-- Every rule that was locked becomes active. Nothing is deleted: the rule text and its history stay as they are, and the structured record keeps
-- a note ("was_locked") of what the rule used to be. The enum value "locked" stays in the database (Postgres cannot easily remove an enum value);
-- the code no longer uses it. Safe to run more than once: after the first run no row has the old value.
UPDATE "rules"
SET "status" = 'active',
    "structured" = COALESCE("structured", '{}'::jsonb) || '{"was_locked": true}'::jsonb,
    "updated_at" = now()
WHERE "status" = 'locked';
