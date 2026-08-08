-- BuyerIntake is the purchase-inquiry aggregate. BuyerRequirement no longer
-- belongs to one Contact; people participate through BuyerIntakeContact.

-- Composite tenant keys let child FKs prove that every referenced row belongs
-- to the same office, even when writes bypass the application service.
ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_office_id_id_key" UNIQUE ("office_id", "id");

CREATE TABLE "buyer_intakes" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "lifecycle_status" TEXT NOT NULL DEFAULT 'open',
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "memo" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "buyer_intakes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "buyer_intakes_lifecycle_status_check"
    CHECK ("lifecycle_status" IN ('open', 'hold', 'closed')),
  CONSTRAINT "buyer_intakes_office_id_id_key"
    UNIQUE ("office_id", "id")
);

CREATE TABLE "buyer_intake_contacts" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "buyer_intake_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'buyer',
  "is_requester" BOOLEAN NOT NULL DEFAULT false,
  "is_primary_contact" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "buyer_intake_contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "buyer_intake_contacts_role_check"
    CHECK ("role" IN (
      'buyer',
      'co_buyer',
      'representative',
      'supporter',
      'advisor',
      'other'
    )),
  CONSTRAINT "buyer_intake_contacts_buyer_intake_id_contact_id_key"
    UNIQUE ("buyer_intake_id", "contact_id")
);

CREATE INDEX "buyer_intakes_office_id_lifecycle_status_updated_at_idx"
  ON "buyer_intakes" ("office_id", "lifecycle_status", "updated_at");
CREATE INDEX "buyer_intakes_office_id_received_at_idx"
  ON "buyer_intakes" ("office_id", "received_at");
CREATE INDEX "buyer_intake_contacts_office_id_contact_id_buyer_intake_id_idx"
  ON "buyer_intake_contacts" ("office_id", "contact_id", "buyer_intake_id");

-- At most one preferred caller and one original requester per intake. These
-- are partial indexes because false values may repeat freely.
CREATE UNIQUE INDEX "buyer_intake_contacts_one_primary_contact"
  ON "buyer_intake_contacts" ("buyer_intake_id")
  WHERE "is_primary_contact" = true;
CREATE UNIQUE INDEX "buyer_intake_contacts_one_requester"
  ON "buyer_intake_contacts" ("buyer_intake_id")
  WHERE "is_requester" = true;

ALTER TABLE "buyer_intakes"
  ADD CONSTRAINT "buyer_intakes_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "buyer_intake_contacts"
  ADD CONSTRAINT "buyer_intake_contacts_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "buyer_intake_contacts"
  ADD CONSTRAINT "buyer_intake_contacts_office_id_buyer_intake_id_fkey"
  FOREIGN KEY ("office_id", "buyer_intake_id")
  REFERENCES "buyer_intakes"("office_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "buyer_intake_contacts"
  ADD CONSTRAINT "buyer_intake_contacts_office_id_contact_id_fkey"
  FOREIGN KEY ("office_id", "contact_id")
  REFERENCES "contacts"("office_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "buyer_requirements"
  ADD COLUMN "buyer_intake_id" UUID,
  ADD COLUMN "priority_rank" INTEGER;

-- Existing rows are grouped by office + former contact. This preserves the
-- current UI meaning: one person's parallel sale/jeonse/monthly conditions
-- become ranked requirements under one intake.
CREATE TEMP TABLE "_buyer_intake_backfill" ON COMMIT DROP AS
SELECT
  br."office_id",
  br."contact_id",
  gen_random_uuid() AS "buyer_intake_id",
  CASE
    WHEN bool_or(br."status" = 'active') THEN 'open'
    WHEN bool_or(br."status" = 'hold') THEN 'hold'
    ELSE 'closed'
  END AS "lifecycle_status",
  min(br."created_at") AS "received_at",
  min(br."created_at") AS "created_at",
  max(br."updated_at") AS "updated_at"
FROM "buyer_requirements" br
GROUP BY br."office_id", br."contact_id";

INSERT INTO "buyer_intakes" (
  "id",
  "office_id",
  "lifecycle_status",
  "received_at",
  "memo",
  "created_at",
  "updated_at"
)
SELECT
  b."buyer_intake_id",
  b."office_id",
  b."lifecycle_status",
  b."received_at",
  NULL,
  b."created_at",
  b."updated_at"
FROM "_buyer_intake_backfill" b;

INSERT INTO "buyer_intake_contacts" (
  "id",
  "office_id",
  "buyer_intake_id",
  "contact_id",
  "role",
  "is_requester",
  "is_primary_contact",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  b."office_id",
  b."buyer_intake_id",
  b."contact_id",
  'buyer',
  true,
  true,
  b."created_at",
  b."updated_at"
FROM "_buyer_intake_backfill" b;

UPDATE "buyer_requirements" br
SET "buyer_intake_id" = b."buyer_intake_id"
FROM "_buyer_intake_backfill" b
WHERE b."office_id" = br."office_id"
  AND b."contact_id" = br."contact_id";

WITH ranked AS (
  SELECT
    br."id",
    row_number() OVER (
      PARTITION BY br."buyer_intake_id"
      ORDER BY br."created_at" ASC, br."id" ASC
    )::INTEGER AS "priority_rank"
  FROM "buyer_requirements" br
)
UPDATE "buyer_requirements" br
SET "priority_rank" = ranked."priority_rank"
FROM ranked
WHERE ranked."id" = br."id";

ALTER TABLE "buyer_requirements"
  ALTER COLUMN "buyer_intake_id" SET NOT NULL,
  ALTER COLUMN "priority_rank" SET DEFAULT 1,
  ALTER COLUMN "priority_rank" SET NOT NULL;

ALTER TABLE "buyer_requirements"
  ADD CONSTRAINT "buyer_requirements_priority_rank_check"
  CHECK ("priority_rank" >= 1);

CREATE INDEX "buyer_requirements_buyer_intake_id_priority_rank_idx"
  ON "buyer_requirements" ("buyer_intake_id", "priority_rank");

ALTER TABLE "buyer_requirements"
  ADD CONSTRAINT "buyer_requirements_office_id_buyer_intake_id_fkey"
  FOREIGN KEY ("office_id", "buyer_intake_id")
  REFERENCES "buyer_intakes"("office_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "buyer_requirements"
  DROP CONSTRAINT "buyer_requirements_contact_id_fkey";
ALTER TABLE "buyer_requirements"
  DROP COLUMN "contact_id";
