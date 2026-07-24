-- Active human-in-the-loop drafts may outlive a schema migration.
-- Translate the one lossless Listing.checkStatus mapping and terminate any
-- remaining ambiguous draft before a later approval can write a removed field.

UPDATE "entity_drafts"
SET "proposed_changes" =
  ("proposed_changes" - 'checkStatus')
  || jsonb_build_object('isPaused', true)
WHERE "entity_type" = 'listing'
  AND "status" IN ('pending', 'processing', 'approved', 'executing')
  AND "proposed_changes" ->> 'checkStatus' = 'hold';

UPDATE "entity_drafts"
SET
  "status" = 'expired',
  "expires_at" = COALESCE("expires_at", CURRENT_TIMESTAMP),
  "execution_error" =
    'Legacy Listing.checkStatus draft expired during status-axis migration; regenerate with explicit intake confirmation, lifecycle, or Deal changes.'
WHERE "entity_type" = 'listing'
  AND "status" IN ('pending', 'processing', 'approved', 'executing')
  AND "proposed_changes" ? 'checkStatus';

UPDATE "entity_drafts"
SET
  "status" = 'expired',
  "expires_at" = COALESCE("expires_at", CURRENT_TIMESTAMP),
  "execution_error" =
    'Legacy ListingIntake.status draft expired during status-axis migration; regenerate with lifecycleStatus or confirmation fields.'
WHERE "entity_type" = 'listing_intake'
  AND "status" IN ('pending', 'processing', 'approved', 'executing')
  AND "proposed_changes" ? 'status';
