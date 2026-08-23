-- ListingAdvertisement is one continuous observed publication. Keep provider
-- registration time separate from ERP observation time and preserve the last
-- provider row status without applying any ListingIntake lifecycle policy.
ALTER TABLE "listing_advertisements"
  ADD COLUMN "first_seen_at" TIMESTAMP(3),
  ADD COLUMN "last_seen_at" TIMESTAMP(3),
  ADD COLUMN "provider_status" TEXT,
  ADD COLUMN "provider_status_observed_at" TIMESTAMP(3);

UPDATE "listing_advertisements"
SET
  "first_seen_at" = "created_at",
  "last_seen_at" = COALESCE("last_synced_at", "updated_at", "created_at");

ALTER TABLE "listing_advertisements"
  ALTER COLUMN "first_seen_at" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "first_seen_at" SET NOT NULL,
  ALTER COLUMN "last_seen_at" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "last_seen_at" SET NOT NULL;

-- ended_at is an observed disappearance time, never a planned expiration.
-- Repair legacy lifecycle pairs before enforcing that invariant.
UPDATE "listing_advertisements"
SET "ended_at" = COALESCE("last_synced_at", "updated_at", "created_at")
WHERE "status" = 'ended' AND "ended_at" IS NULL;

UPDATE "listing_advertisements"
SET "ended_at" = NULL
WHERE "status" = 'active' AND "ended_at" IS NOT NULL;

ALTER TABLE "listing_advertisements"
  ADD CONSTRAINT "listing_advertisements_observed_lifecycle_check"
  CHECK (
    ("status" = 'active' AND "ended_at" IS NULL)
    OR ("status" = 'ended' AND "ended_at" IS NOT NULL)
  );

CREATE TABLE "listing_advertisement_price_histories" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "listing_advertisement_id" UUID NOT NULL,
  "snapshot_session_id" UUID,
  "advertised_price" INTEGER,
  "advertised_deposit" INTEGER,
  "advertised_monthly_rent" INTEGER,
  "observed_at" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'cp_sync',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "listing_advertisement_price_histories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listing_advertisement_price_histories_source_check"
    CHECK ("source" IN ('cp_sync', 'manual', 'migration')),
  CONSTRAINT "listing_advertisement_price_histories_price_check"
    CHECK (
      ("advertised_price" IS NULL OR "advertised_price" >= 0)
      AND ("advertised_deposit" IS NULL OR "advertised_deposit" >= 0)
      AND ("advertised_monthly_rent" IS NULL OR "advertised_monthly_rent" >= 0)
    )
);

-- Preserve the current known price at its last known observation as the first
-- usable point for every legacy publication, including ended publications.
INSERT INTO "listing_advertisement_price_histories" (
  "id",
  "office_id",
  "listing_advertisement_id",
  "advertised_price",
  "advertised_deposit",
  "advertised_monthly_rent",
  "observed_at",
  "source"
)
SELECT
  gen_random_uuid(),
  "office_id",
  "id",
  "advertised_price",
  "advertised_deposit",
  "advertised_monthly_rent",
  "last_seen_at",
  'migration'
FROM "listing_advertisements";

CREATE INDEX "listing_ad_price_histories_office_observed_idx"
  ON "listing_advertisement_price_histories"("office_id", "observed_at");
CREATE INDEX "listing_ad_price_histories_ad_observed_idx"
  ON "listing_advertisement_price_histories"("listing_advertisement_id", "observed_at");
CREATE INDEX "listing_ad_price_histories_snapshot_idx"
  ON "listing_advertisement_price_histories"("snapshot_session_id");
CREATE UNIQUE INDEX "listing_ad_price_histories_snapshot_key"
  ON "listing_advertisement_price_histories"("listing_advertisement_id", "snapshot_session_id")
  WHERE "snapshot_session_id" IS NOT NULL;

ALTER TABLE "listing_advertisement_price_histories"
  ADD CONSTRAINT "listing_ad_price_histories_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "listing_ad_price_histories_advertisement_id_fkey"
    FOREIGN KEY ("listing_advertisement_id") REFERENCES "listing_advertisements"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "listing_ad_price_histories_snapshot_session_id_fkey"
    FOREIGN KEY ("snapshot_session_id") REFERENCES "listing_advertisement_snapshot_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- An external ID identifies only an active provider row. The provider may
-- reuse it for a later publication, so historical rows must not reserve it.
DROP INDEX IF EXISTS "listing_advertisements_office_channel_external_ad_id_key";

CREATE UNIQUE INDEX "listing_advertisements_active_external_ad_id_key"
  ON "listing_advertisements"("office_id", "channel", "external_ad_id")
  WHERE "status" = 'active' AND "external_ad_id" IS NOT NULL;

CREATE UNIQUE INDEX "listing_advertisements_one_active_per_listing_channel"
  ON "listing_advertisements"("office_id", "listing_id", "channel")
  WHERE "status" = 'active';
