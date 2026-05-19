-- Introduce an intake/request layer between Property and Listing.
-- Existing listings are grouped into one active intake per property.

CREATE TABLE "listing_intakes" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "requester_contact_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'active',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "occupancy_status" TEXT,
    "viewing_memo" TEXT,
    "rights_memo" TEXT,
    "field_memo" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_intakes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "listing_intakes_office_id_status_updated_at_idx"
  ON "listing_intakes"("office_id", "status", "updated_at");
CREATE INDEX "listing_intakes_property_id_idx"
  ON "listing_intakes"("property_id");
CREATE INDEX "listing_intakes_requester_contact_id_idx"
  ON "listing_intakes"("requester_contact_id");

CREATE UNIQUE INDEX "listing_intakes_office_id_property_id_active_key"
  ON "listing_intakes"("office_id", "property_id")
  WHERE "status" = 'active';

ALTER TABLE "listing_intakes"
  ADD CONSTRAINT "listing_intakes_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "listing_intakes"
  ADD CONSTRAINT "listing_intakes_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "listing_intakes"
  ADD CONSTRAINT "listing_intakes_requester_contact_id_fkey"
  FOREIGN KEY ("requester_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "listing_intakes" (
    "id",
    "office_id",
    "property_id",
    "status",
    "received_at",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    l."office_id",
    l."property_id",
    'active',
    MIN(l."created_at"),
    MIN(l."created_at"),
    MAX(l."updated_at")
FROM "listings" l
GROUP BY l."office_id", l."property_id";

ALTER TABLE "listings" ADD COLUMN "intake_id" UUID;

UPDATE "listings" l
SET "intake_id" = i."id"
FROM "listing_intakes" i
WHERE i."office_id" = l."office_id"
  AND i."property_id" = l."property_id"
  AND i."status" = 'active';

ALTER TABLE "listings" ALTER COLUMN "intake_id" SET NOT NULL;

ALTER TABLE "listings"
  ADD CONSTRAINT "listings_intake_id_fkey"
  FOREIGN KEY ("intake_id") REFERENCES "listing_intakes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "listings_property_id_transaction_type_key";
CREATE UNIQUE INDEX "listings_intake_id_transaction_type_key"
  ON "listings"("intake_id", "transaction_type");
CREATE INDEX "listings_intake_id_idx" ON "listings"("intake_id");

ALTER TABLE "consultations" ADD COLUMN "listing_intake_id" UUID;
UPDATE "consultations" c
SET "listing_intake_id" = l."intake_id"
FROM "listings" l
WHERE c."listing_id" = l."id";
ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_listing_intake_id_fkey"
  FOREIGN KEY ("listing_intake_id") REFERENCES "listing_intakes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "consultations_office_id_listing_intake_id_idx"
  ON "consultations"("office_id", "listing_intake_id");

ALTER TABLE "tasks" ADD COLUMN "listing_intake_id" UUID;
UPDATE "tasks" t
SET "listing_intake_id" = l."intake_id"
FROM "listings" l
WHERE t."listing_id" = l."id";
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_listing_intake_id_fkey"
  FOREIGN KEY ("listing_intake_id") REFERENCES "listing_intakes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "tasks_listing_intake_id_idx" ON "tasks"("listing_intake_id");

ALTER TABLE "calendar_events" ADD COLUMN "listing_intake_id" UUID;
UPDATE "calendar_events" e
SET "listing_intake_id" = l."intake_id"
FROM "listings" l
WHERE e."listing_id" = l."id";
ALTER TABLE "calendar_events"
  ADD CONSTRAINT "calendar_events_listing_intake_id_fkey"
  FOREIGN KEY ("listing_intake_id") REFERENCES "listing_intakes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "calendar_events_listing_intake_id_idx" ON "calendar_events"("listing_intake_id");

ALTER TABLE "proposals" ADD COLUMN "listing_intake_id" UUID;
UPDATE "proposals" p
SET "listing_intake_id" = l."intake_id"
FROM "listings" l
WHERE p."listing_id" = l."id";
ALTER TABLE "proposals"
  ADD CONSTRAINT "proposals_listing_intake_id_fkey"
  FOREIGN KEY ("listing_intake_id") REFERENCES "listing_intakes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "proposals_listing_intake_id_idx" ON "proposals"("listing_intake_id");

ALTER TABLE "entity_drafts" ADD COLUMN "listing_intake_id" UUID;
UPDATE "entity_drafts" d
SET "listing_intake_id" = l."intake_id"
FROM "listings" l
WHERE d."listing_id" = l."id";
CREATE INDEX "entity_drafts_listing_intake_id_idx" ON "entity_drafts"("listing_intake_id");
