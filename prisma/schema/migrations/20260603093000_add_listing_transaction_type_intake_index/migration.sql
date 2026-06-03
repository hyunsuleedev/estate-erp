-- Speed up listing-intake transaction tabs:
-- WHERE listing_intakes.office_id = ? AND EXISTS (
--   SELECT 1 FROM listings
--   WHERE listings.intake_id = listing_intakes.id
--     AND listings.transaction_type = ?
-- )
CREATE INDEX "listings_office_id_transaction_type_intake_id_idx"
ON "listings"("office_id", "transaction_type", "intake_id");
