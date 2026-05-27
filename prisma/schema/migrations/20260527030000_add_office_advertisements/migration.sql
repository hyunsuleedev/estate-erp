-- CreateTable
CREATE TABLE "office_advertisement_groups" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'naver',
    "listing_id" UUID,
    "listing_advertisement_id" UUID,
    "site_name" TEXT,
    "building_name" TEXT,
    "dong_hint" TEXT,
    "ho_hint" TEXT,
    "floor_info" TEXT,
    "area_name" TEXT,
    "exclusive_area_m2" DECIMAL,
    "supply_area_m2" DECIMAL,
    "transaction_type" TEXT,
    "main_advertisement_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'needs_unit_confirmation',
    "memo" TEXT,
    "own_price" INTEGER,
    "own_deposit" INTEGER,
    "own_monthly_rent" INTEGER,
    "related_price_min" INTEGER,
    "related_price_max" INTEGER,
    "related_count" INTEGER NOT NULL DEFAULT 0,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "office_advertisement_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_advertisements" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'naver',
    "article_no" TEXT NOT NULL,
    "source_url" TEXT,
    "cp_pc_article_url" TEXT,
    "is_mine" BOOLEAN NOT NULL DEFAULT false,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "article_name" TEXT,
    "realtor_name" TEXT,
    "realtor_id" TEXT,
    "representative_tel_no" TEXT,
    "price" INTEGER,
    "deposit" INTEGER,
    "monthly_rent" INTEGER,
    "ranking" INTEGER,
    "same_addr_cnt" INTEGER,
    "article_confirm_ymd" TEXT,
    "seango" BOOLEAN NOT NULL DEFAULT false,
    "epju" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "office_advertisements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "office_advertisement_groups_listing_advertisement_id_key" ON "office_advertisement_groups"("listing_advertisement_id");

-- CreateIndex
CREATE UNIQUE INDEX "office_advertisement_groups_main_advertisement_id_key" ON "office_advertisement_groups"("main_advertisement_id");

-- CreateIndex
CREATE INDEX "office_advertisement_groups_office_id_source_status_idx" ON "office_advertisement_groups"("office_id", "source", "status");

-- CreateIndex
CREATE INDEX "office_advertisement_groups_office_id_listing_id_idx" ON "office_advertisement_groups"("office_id", "listing_id");

-- CreateIndex
CREATE INDEX "office_advertisement_groups_office_id_last_seen_at_idx" ON "office_advertisement_groups"("office_id", "last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "office_advertisements_office_id_source_article_no_key" ON "office_advertisements"("office_id", "source", "article_no");

-- CreateIndex
CREATE INDEX "office_advertisements_office_id_group_id_idx" ON "office_advertisements"("office_id", "group_id");

-- CreateIndex
CREATE INDEX "office_advertisements_office_id_is_mine_idx" ON "office_advertisements"("office_id", "is_mine");

-- CreateIndex
CREATE INDEX "office_advertisements_office_id_is_active_idx" ON "office_advertisements"("office_id", "is_active");

-- CreateIndex
CREATE INDEX "office_advertisements_office_id_last_seen_at_idx" ON "office_advertisements"("office_id", "last_seen_at");

-- AddForeignKey
ALTER TABLE "office_advertisement_groups" ADD CONSTRAINT "office_advertisement_groups_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_advertisement_groups" ADD CONSTRAINT "office_advertisement_groups_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_advertisement_groups" ADD CONSTRAINT "office_advertisement_groups_listing_advertisement_id_fkey" FOREIGN KEY ("listing_advertisement_id") REFERENCES "listing_advertisements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_advertisement_groups" ADD CONSTRAINT "office_advertisement_groups_main_advertisement_id_fkey" FOREIGN KEY ("main_advertisement_id") REFERENCES "office_advertisements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_advertisements" ADD CONSTRAINT "office_advertisements_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_advertisements" ADD CONSTRAINT "office_advertisements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "office_advertisement_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
