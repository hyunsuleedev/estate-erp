-- Move listing-specific fields out of properties into the new listings table.
-- Existing records are preserved by creating a 1:1 listing per legacy property.

-- Drop old foreign keys that point to properties for listing-scoped tables.
ALTER TABLE "deals" DROP CONSTRAINT "deals_property_id_fkey";
ALTER TABLE "matches" DROP CONSTRAINT "matches_property_id_fkey";
ALTER TABLE "network_shared_properties" DROP CONSTRAINT "network_shared_properties_property_id_fkey";
ALTER TABLE "price_histories" DROP CONSTRAINT "price_histories_property_id_fkey";

-- Create the new listings table.
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "transaction_type" TEXT NOT NULL,
    "price" INTEGER,
    "deposit" INTEGER,
    "monthly_rent" INTEGER,
    "check_status" TEXT NOT NULL DEFAULT 'unverified',
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- Add nullable listing references first so we can backfill them.
ALTER TABLE "calendar_events" ADD COLUMN "listing_id" UUID;
ALTER TABLE "consultations" ADD COLUMN "listing_id" UUID;
ALTER TABLE "deals" ADD COLUMN "listing_id" UUID;
ALTER TABLE "matches" ADD COLUMN "listing_id" UUID;
ALTER TABLE "network_shared_properties" ADD COLUMN "listing_id" UUID;
ALTER TABLE "price_histories" ADD COLUMN "listing_id" UUID;
ALTER TABLE "tasks" ADD COLUMN "listing_id" UUID;

-- Legacy properties represented both the unit anchor and the active listing.
-- Reuse the property UUID as the initial listing UUID to preserve references.
INSERT INTO "listings" (
    "id",
    "office_id",
    "property_id",
    "transaction_type",
    "price",
    "deposit",
    "monthly_rent",
    "check_status",
    "is_hidden",
    "memo",
    "created_at",
    "updated_at"
)
SELECT
    "id",
    "office_id",
    "id",
    "transaction_type",
    "price",
    "deposit",
    "monthly_rent",
    "check_status",
    "is_hidden",
    "memo",
    "created_at",
    "updated_at"
FROM "properties";

-- Backfill listing references. For legacy rows, property_id identified the listing.
UPDATE "calendar_events"
SET "listing_id" = "property_id"
WHERE "property_id" IS NOT NULL;

UPDATE "consultations"
SET "listing_id" = "property_id"
WHERE "property_id" IS NOT NULL;

UPDATE "deals"
SET "listing_id" = "property_id"
WHERE "property_id" IS NOT NULL;

UPDATE "matches"
SET "listing_id" = "property_id"
WHERE "property_id" IS NOT NULL;

UPDATE "network_shared_properties"
SET "listing_id" = "property_id"
WHERE "property_id" IS NOT NULL;

UPDATE "price_histories"
SET "listing_id" = "property_id"
WHERE "property_id" IS NOT NULL;

UPDATE "tasks"
SET "listing_id" = "property_id"
WHERE "property_id" IS NOT NULL;

-- Drop indexes that still reference legacy property-based listing fields.
DROP INDEX "network_shared_properties_room_id_property_id_key";
DROP INDEX "price_histories_property_id_created_at_idx";
DROP INDEX "properties_office_id_check_status_idx";

-- Listing-scoped tables now require listing_id instead of property_id.
ALTER TABLE "deals" ALTER COLUMN "listing_id" SET NOT NULL;
ALTER TABLE "matches" ALTER COLUMN "listing_id" SET NOT NULL;
ALTER TABLE "network_shared_properties" ALTER COLUMN "listing_id" SET NOT NULL;
ALTER TABLE "price_histories" ALTER COLUMN "listing_id" SET NOT NULL;

ALTER TABLE "deals" DROP COLUMN "property_id";
ALTER TABLE "matches" DROP COLUMN "property_id";
ALTER TABLE "network_shared_properties" DROP COLUMN "property_id";
ALTER TABLE "price_histories" DROP COLUMN "property_id";

-- Property becomes the physical unit anchor only.
ALTER TABLE "properties"
    DROP COLUMN "transaction_type",
    DROP COLUMN "price",
    DROP COLUMN "deposit",
    DROP COLUMN "monthly_rent",
    DROP COLUMN "check_status",
    DROP COLUMN "is_hidden";

-- New indexes for the split model.
CREATE INDEX "listings_office_id_check_status_idx" ON "listings"("office_id", "check_status");
CREATE INDEX "listings_property_id_idx" ON "listings"("property_id");
CREATE INDEX "consultations_office_id_listing_id_idx" ON "consultations"("office_id", "listing_id");
CREATE UNIQUE INDEX "network_shared_properties_room_id_listing_id_key" ON "network_shared_properties"("room_id", "listing_id");
CREATE INDEX "price_histories_listing_id_created_at_idx" ON "price_histories"("listing_id", "created_at");
CREATE INDEX "properties_office_id_idx" ON "properties"("office_id");
CREATE UNIQUE INDEX "properties_office_id_site_id_unit_id_key" ON "properties"("office_id", "site_id", "unit_id");
CREATE INDEX "tasks_listing_id_idx" ON "tasks"("listing_id");

-- New foreign keys.
ALTER TABLE "consultations"
    ADD CONSTRAINT "consultations_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "matches"
    ADD CONSTRAINT "matches_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deals"
    ADD CONSTRAINT "deals_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "network_shared_properties"
    ADD CONSTRAINT "network_shared_properties_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listings"
    ADD CONSTRAINT "listings_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listings"
    ADD CONSTRAINT "listings_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "price_histories"
    ADD CONSTRAINT "price_histories_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "calendar_events"
    ADD CONSTRAINT "calendar_events_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
