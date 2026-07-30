-- ListingAdvertisement is an observed CP advertisement, not a proposal or a
-- sync attempt. Preserve legacy rows as the last known active snapshot and
-- keep only the real external-resource lifecycle states.
UPDATE "listing_advertisements"
SET
  "status" = 'active',
  "ended_at" = NULL
WHERE "status" NOT IN ('active', 'ended');

ALTER TABLE "listing_advertisements"
ADD CONSTRAINT "listing_advertisements_status_check"
CHECK ("status" IN ('active', 'ended'));
