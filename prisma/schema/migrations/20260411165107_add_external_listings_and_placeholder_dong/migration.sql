-- DropForeignKey
ALTER TABLE "units" DROP CONSTRAINT "units_dong_id_fkey";

-- DropIndex
DROP INDEX "contacts_office_id_phone_idx";

-- AlterTable
ALTER TABLE "dongs" ADD COLUMN     "is_placeholder" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "is_done";

-- AlterTable
ALTER TABLE "units" ALTER COLUMN "dong_id" SET NOT NULL;

-- CreateTable
CREATE TABLE "external_listing_groups" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "unit_id" UUID,
    "building_name" TEXT,
    "inferred_ho" TEXT,
    "area_name" TEXT,
    "exclusive_area_m2" DECIMAL,
    "transaction_type" TEXT NOT NULL,
    "memo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unmatched',
    "main_external_listing_id" UUID,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_listing_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_listings" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'naver',
    "article_no" TEXT NOT NULL,
    "source_url" TEXT,
    "cp_name" TEXT,
    "cpid" TEXT,
    "cp_pc_article_url" TEXT,
    "representative_article_no" TEXT,
    "same_addr_cnt" INTEGER,
    "same_addr_direct_cnt" INTEGER,
    "same_addr_max_prc" TEXT,
    "same_addr_min_prc" TEXT,
    "transaction_type" TEXT NOT NULL,
    "price" INTEGER,
    "deposit" INTEGER,
    "monthly_rent" INTEGER,
    "article_name" TEXT,
    "article_feature_desc" TEXT,
    "detail_description" TEXT,
    "article_confirm_ymd" TEXT,
    "floor_info" TEXT,
    "exclusive_area_m2" DECIMAL,
    "supply_area_m2" DECIMAL,
    "direction" TEXT,
    "tag_list" JSONB,
    "verification_type_code" TEXT,
    "realtor_id" TEXT,
    "realtor_name" TEXT,
    "original_realtor_name" TEXT,
    "representative_tel_no" TEXT,
    "cell_phone_no" TEXT,
    "ranking" INTEGER,
    "is_shared_rank" BOOLEAN NOT NULL DEFAULT false,
    "shared_rank" INTEGER,
    "same_rank_num" INTEGER,
    "seango" BOOLEAN NOT NULL DEFAULT false,
    "epju" BOOLEAN NOT NULL DEFAULT false,
    "expose_start_ymd" INTEGER,
    "expose_end_ymd" INTEGER,
    "price_change_state" TEXT,
    "is_price_modification" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_listing_groups_main_external_listing_id_key" ON "external_listing_groups"("main_external_listing_id");

-- CreateIndex
CREATE INDEX "external_listing_groups_office_id_site_id_idx" ON "external_listing_groups"("office_id", "site_id");

-- CreateIndex
CREATE INDEX "external_listing_groups_office_id_unit_id_idx" ON "external_listing_groups"("office_id", "unit_id");

-- CreateIndex
CREATE INDEX "external_listing_groups_office_id_status_idx" ON "external_listing_groups"("office_id", "status");

-- CreateIndex
CREATE INDEX "external_listing_groups_office_id_last_seen_at_idx" ON "external_listing_groups"("office_id", "last_seen_at");

-- CreateIndex
CREATE INDEX "external_listings_office_id_group_id_idx" ON "external_listings"("office_id", "group_id");

-- CreateIndex
CREATE INDEX "external_listings_office_id_last_seen_at_idx" ON "external_listings"("office_id", "last_seen_at");

-- CreateIndex
CREATE INDEX "external_listings_office_id_is_active_idx" ON "external_listings"("office_id", "is_active");

-- CreateIndex
CREATE INDEX "external_listings_office_id_ranking_idx" ON "external_listings"("office_id", "ranking");

-- CreateIndex
CREATE UNIQUE INDEX "external_listings_office_id_source_article_no_key" ON "external_listings"("office_id", "source", "article_no");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_office_id_phone_key" ON "contacts"("office_id", "phone");

-- CreateIndex
CREATE INDEX "dongs_site_id_idx" ON "dongs"("site_id");

-- AddForeignKey
ALTER TABLE "external_listing_groups" ADD CONSTRAINT "external_listing_groups_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_listing_groups" ADD CONSTRAINT "external_listing_groups_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_listing_groups" ADD CONSTRAINT "external_listing_groups_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_listing_groups" ADD CONSTRAINT "external_listing_groups_main_external_listing_id_fkey" FOREIGN KEY ("main_external_listing_id") REFERENCES "external_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_listings" ADD CONSTRAINT "external_listings_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_listings" ADD CONSTRAINT "external_listings_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "external_listing_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_dong_id_fkey" FOREIGN KEY ("dong_id") REFERENCES "dongs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
