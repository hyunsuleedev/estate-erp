-- Align ListingIntake.status with Listing.check_status values.

UPDATE "listing_intakes"
SET "status" = CASE "status"
  WHEN 'active' THEN 'unverified'
  WHEN 'paused' THEN 'hold'
  WHEN 'completed' THEN 'done'
  WHEN 'cancelled' THEN 'done'
  ELSE "status"
END
WHERE "status" IN ('active', 'paused', 'completed', 'cancelled');

ALTER TABLE "listing_intakes"
  ALTER COLUMN "status" SET DEFAULT 'unverified';

DROP INDEX IF EXISTS "listing_intakes_office_id_property_id_active_key";

CREATE UNIQUE INDEX "listing_intakes_office_id_property_id_open_key"
  ON "listing_intakes"("office_id", "property_id")
  WHERE "status" IN ('unverified', 'verified', 'in_contract', 'hold');
