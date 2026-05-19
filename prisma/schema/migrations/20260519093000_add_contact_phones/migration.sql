-- CreateTable
CREATE TABLE "contact_phones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "office_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "normalized_phone" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'mobile',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_phones_pkey" PRIMARY KEY ("id")
);

-- Backfill existing main phone numbers.
INSERT INTO "contact_phones" (
    "office_id",
    "contact_id",
    "phone",
    "normalized_phone",
    "label",
    "is_primary",
    "is_active"
)
SELECT
    "office_id",
    "id",
    "phone",
    regexp_replace("phone", '[\s\-\(\)]', '', 'g'),
    'mobile',
    true,
    true
FROM "contacts"
WHERE "phone" IS NOT NULL AND trim("phone") <> '';

-- Backfill old secondary phone numbers as non-primary numbers.
INSERT INTO "contact_phones" (
    "office_id",
    "contact_id",
    "phone",
    "normalized_phone",
    "label",
    "is_primary",
    "is_active"
)
SELECT
    c."office_id",
    c."id",
    c."phone2",
    regexp_replace(c."phone2", '[\s\-\(\)]', '', 'g'),
    'other',
    false,
    true
FROM "contacts" c
WHERE c."phone2" IS NOT NULL
  AND trim(c."phone2") <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "contact_phones" cp
    WHERE cp."office_id" = c."office_id"
      AND cp."contact_id" = c."id"
      AND cp."normalized_phone" = regexp_replace(c."phone2", '[\s\-\(\)]', '', 'g')
  );

-- CreateIndex
CREATE UNIQUE INDEX "contact_phones_office_id_contact_id_normalized_phone_key" ON "contact_phones"("office_id", "contact_id", "normalized_phone");

-- CreateIndex
CREATE INDEX "contact_phones_office_id_normalized_phone_idx" ON "contact_phones"("office_id", "normalized_phone");

-- CreateIndex
CREATE INDEX "contact_phones_contact_id_idx" ON "contact_phones"("contact_id");

-- AddForeignKey
ALTER TABLE "contact_phones" ADD CONSTRAINT "contact_phones_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_phones" ADD CONSTRAINT "contact_phones_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old secondary phone column after backfill.
ALTER TABLE "contacts" DROP COLUMN "phone2";
