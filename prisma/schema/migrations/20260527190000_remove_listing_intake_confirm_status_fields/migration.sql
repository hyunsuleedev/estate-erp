DROP INDEX IF EXISTS "listing_intakes_office_id_confirm_status_next_confirm_at_idx";
DROP INDEX IF EXISTS "listing_intakes_last_confirm_consultation_id_idx";

ALTER TABLE "listing_intakes"
  DROP CONSTRAINT IF EXISTS "listing_intakes_last_confirm_consultation_id_fkey";

ALTER TABLE "listing_intakes"
  DROP COLUMN IF EXISTS "confirm_status",
  DROP COLUMN IF EXISTS "last_confirm_memo",
  DROP COLUMN IF EXISTS "last_confirm_consultation_id";

CREATE INDEX IF NOT EXISTS "listing_intakes_office_id_next_confirm_at_idx"
  ON "listing_intakes"("office_id", "next_confirm_at");
