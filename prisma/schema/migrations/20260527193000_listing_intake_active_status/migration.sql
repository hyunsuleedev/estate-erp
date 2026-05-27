UPDATE "listing_intakes"
SET "status" = 'active'
WHERE "status" = 'verified';

DROP INDEX IF EXISTS "listing_intakes_office_id_property_id_open_key";

CREATE UNIQUE INDEX "listing_intakes_office_id_property_id_open_key"
  ON "listing_intakes"("office_id", "property_id")
  WHERE "status" IN ('unverified', 'active', 'in_contract', 'hold');
