ALTER TABLE "office_advertisement_groups" DROP CONSTRAINT IF EXISTS "office_advertisement_groups_listing_id_fkey";

DROP INDEX IF EXISTS "office_advertisement_groups_office_id_listing_id_idx";

ALTER TABLE "office_advertisement_groups" DROP COLUMN IF EXISTS "listing_id";
