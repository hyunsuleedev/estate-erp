-- Speed up default listing-intake list queries:
-- WHERE office_id = ? ORDER BY received_at DESC LIMIT ?
CREATE INDEX "listing_intakes_office_id_received_at_idx"
ON "listing_intakes"("office_id", "received_at");
