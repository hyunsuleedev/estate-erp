ALTER TABLE "listing_intakes"
  DROP CONSTRAINT IF EXISTS "listing_intakes_closed_reason_check";

ALTER TABLE "listing_intakes"
  ADD CONSTRAINT "listing_intakes_closed_reason_check"
    CHECK (
      ("lifecycle_status" = 'closed'
        AND "closed_reason" IN (
          'withdrawn',
          'unavailable',
          'deal_completed',
          'external_deal_completed',
          'superseded',
          'other'
        ))
      OR
      ("lifecycle_status" <> 'closed' AND "closed_reason" IS NULL)
    );
