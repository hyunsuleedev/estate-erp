-- This project is still in development. Existing comparison snapshots use the
-- superseded channel/link model, so they are intentionally discarded.
-- CASCADE also clears draft agent actions that referenced those old ads.
TRUNCATE TABLE
  "office_advertisements",
  "office_advertisement_groups",
  "listing_advertisements"
CASCADE;

ALTER TABLE "listing_advertisements"
ADD COLUMN "naver_article_no" TEXT,
ADD COLUMN "naver_url" TEXT;

CREATE INDEX "listing_advertisements_office_id_naver_article_no_idx"
ON "listing_advertisements"("office_id", "naver_article_no");

DROP INDEX IF EXISTS "office_advertisement_groups_office_id_source_status_idx";
DROP INDEX IF EXISTS "office_advertisements_office_id_source_article_no_key";

ALTER TABLE "office_advertisement_groups"
DROP COLUMN "source",
DROP COLUMN "site_name",
DROP COLUMN "building_name",
DROP COLUMN "dong_hint",
DROP COLUMN "ho_hint",
DROP COLUMN "floor_info",
DROP COLUMN "area_name",
DROP COLUMN "exclusive_area_m2",
DROP COLUMN "supply_area_m2",
DROP COLUMN "transaction_type",
DROP COLUMN "status",
ALTER COLUMN "listing_advertisement_id" SET NOT NULL;

ALTER TABLE "office_advertisements"
DROP COLUMN "source",
DROP COLUMN "cp_pc_article_url";

CREATE UNIQUE INDEX "office_advertisements_office_id_article_no_key"
ON "office_advertisements"("office_id", "article_no");

ALTER TABLE "office_advertisement_groups"
DROP CONSTRAINT IF EXISTS "office_advertisement_groups_listing_advertisement_id_fkey";

ALTER TABLE "office_advertisement_groups"
ADD CONSTRAINT "office_advertisement_groups_listing_advertisement_id_fkey"
FOREIGN KEY ("listing_advertisement_id")
REFERENCES "listing_advertisements"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
