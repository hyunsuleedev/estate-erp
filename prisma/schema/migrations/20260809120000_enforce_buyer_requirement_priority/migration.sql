-- Normalize every buyer intake to a dense, deterministic 1..N requirement order
-- before adding the uniqueness guarantee.
WITH ranked AS (
  SELECT
    br."id",
    ROW_NUMBER() OVER (
      PARTITION BY br."buyer_intake_id"
      ORDER BY br."priority_rank" ASC, br."created_at" ASC, br."id" ASC
    )::INTEGER AS "priority_rank"
  FROM "buyer_requirements" br
)
UPDATE "buyer_requirements" br
SET "priority_rank" = ranked."priority_rank"
FROM ranked
WHERE ranked."id" = br."id";

-- Reordering temporarily overlaps the moving row with shifted siblings inside
-- one transaction. Deferring the check guarantees uniqueness at commit while
-- allowing that atomic range update.
ALTER TABLE "buyer_requirements"
  ADD CONSTRAINT "buyer_requirements_buyer_intake_id_priority_rank_key"
  UNIQUE ("buyer_intake_id", "priority_rank")
  DEFERRABLE INITIALLY DEFERRED;

-- The unique constraint's index covers the old lookup index's leading columns.
DROP INDEX IF EXISTS "buyer_requirements_buyer_intake_id_priority_rank_idx";
