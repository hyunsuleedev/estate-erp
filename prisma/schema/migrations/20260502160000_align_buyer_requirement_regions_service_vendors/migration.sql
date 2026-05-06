-- Align schema changes that already existed in the local development DB
-- but were missing from migration history.

-- AlterTable
ALTER TABLE "buyer_requirements" DROP COLUMN "regions";

-- AlterTable
ALTER TABLE "external_listing_groups" ADD COLUMN "favorite" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "buyer_requirement_sites" (
    "id" UUID NOT NULL,
    "buyer_req_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "priority" INTEGER,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buyer_requirement_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_requirement_regions" (
    "id" UUID NOT NULL,
    "buyer_req_id" UUID NOT NULL,
    "province_code" VARCHAR(2),
    "district_code" VARCHAR(5),
    "ward_code" VARCHAR(10),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buyer_requirement_regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_vendors" (
    "id" UUID NOT NULL,
    "office_id" UUID,
    "name" TEXT NOT NULL,
    "business_type" TEXT,
    "service_categories" TEXT[],
    "coverage_districts" TEXT[],
    "price_note" TEXT,
    "description" TEXT,
    "memo" TEXT,
    "tags" TEXT[],
    "ad_tier" TEXT NOT NULL DEFAULT 'none',
    "ad_start_date" TIMESTAMP(3),
    "ad_end_date" TIMESTAMP(3),
    "ad_priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_contacts" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" TEXT,
    "memo" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_vendor_favorites" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "office_vendor_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "buyer_requirement_sites_site_id_idx" ON "buyer_requirement_sites"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "buyer_requirement_sites_buyer_req_id_site_id_key" ON "buyer_requirement_sites"("buyer_req_id", "site_id");

-- CreateIndex
CREATE INDEX "buyer_requirement_regions_buyer_req_id_idx" ON "buyer_requirement_regions"("buyer_req_id");

-- CreateIndex
CREATE INDEX "buyer_requirement_regions_ward_code_idx" ON "buyer_requirement_regions"("ward_code");

-- CreateIndex
CREATE INDEX "buyer_requirement_regions_district_code_idx" ON "buyer_requirement_regions"("district_code");

-- CreateIndex
CREATE INDEX "service_vendors_office_id_idx" ON "service_vendors"("office_id");

-- CreateIndex
CREATE INDEX "service_vendors_is_active_ad_tier_ad_priority_idx" ON "service_vendors"("is_active", "ad_tier", "ad_priority");

-- CreateIndex
CREATE INDEX "vendor_contacts_vendor_id_idx" ON "vendor_contacts"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_contacts_phone_idx" ON "vendor_contacts"("phone");

-- CreateIndex
CREATE INDEX "office_vendor_favorites_office_id_idx" ON "office_vendor_favorites"("office_id");

-- CreateIndex
CREATE UNIQUE INDEX "office_vendor_favorites_office_id_vendor_id_key" ON "office_vendor_favorites"("office_id", "vendor_id");

-- AddForeignKey
ALTER TABLE "buyer_requirement_sites" ADD CONSTRAINT "buyer_requirement_sites_buyer_req_id_fkey" FOREIGN KEY ("buyer_req_id") REFERENCES "buyer_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_requirement_sites" ADD CONSTRAINT "buyer_requirement_sites_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_requirement_regions" ADD CONSTRAINT "buyer_requirement_regions_buyer_req_id_fkey" FOREIGN KEY ("buyer_req_id") REFERENCES "buyer_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_requirement_regions" ADD CONSTRAINT "buyer_requirement_regions_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "provinces"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_requirement_regions" ADD CONSTRAINT "buyer_requirement_regions_district_code_fkey" FOREIGN KEY ("district_code") REFERENCES "districts"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_requirement_regions" ADD CONSTRAINT "buyer_requirement_regions_ward_code_fkey" FOREIGN KEY ("ward_code") REFERENCES "wards"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_vendors" ADD CONSTRAINT "service_vendors_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "service_vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_vendor_favorites" ADD CONSTRAINT "office_vendor_favorites_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_vendor_favorites" ADD CONSTRAINT "office_vendor_favorites_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "service_vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
