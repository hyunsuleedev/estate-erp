/*
  Warnings:

  - You are about to drop the column `building_types` on the `buyer_requirements` table. All the data in the column will be lost.
  - You are about to drop the column `building_id` on the `dongs` table. All the data in the column will be lost.
  - You are about to drop the column `building_id` on the `properties` table. All the data in the column will be lost.
  - You are about to drop the column `building_id` on the `units` table. All the data in the column will be lost.
  - You are about to drop the `buildings` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `site_id` to the `dongs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `site_id` to the `properties` table without a default value. This is not possible if the table is not empty.
  - Added the required column `site_id` to the `units` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "buildings" DROP CONSTRAINT "buildings_office_id_fkey";

-- DropForeignKey
ALTER TABLE "dongs" DROP CONSTRAINT "dongs_building_id_fkey";

-- DropForeignKey
ALTER TABLE "properties" DROP CONSTRAINT "properties_building_id_fkey";

-- DropForeignKey
ALTER TABLE "units" DROP CONSTRAINT "units_building_id_fkey";

-- AlterTable
ALTER TABLE "buyer_requirements" DROP COLUMN "building_types",
ADD COLUMN     "site_types" TEXT[];

-- AlterTable
ALTER TABLE "dongs" DROP COLUMN "building_id",
ADD COLUMN     "site_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "properties" DROP COLUMN "building_id",
ADD COLUMN     "site_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "units" DROP COLUMN "building_id",
ADD COLUMN     "site_id" UUID NOT NULL;

-- DropTable
DROP TABLE "buildings";

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sido" TEXT NOT NULL,
    "sigungu" TEXT NOT NULL,
    "eupmyeondong" TEXT NOT NULL,
    "ri" TEXT,
    "pnu_code" TEXT,
    "road_name" TEXT,
    "road_building_main" INTEGER,
    "road_building_sub" INTEGER,
    "road_address" TEXT,
    "jibun_main" TEXT,
    "jibun_sub" TEXT,
    "jibun_address" TEXT,
    "lat" DECIMAL,
    "lng" DECIMAL,
    "complex_code" TEXT,
    "zip_code" TEXT,
    "total_units" INTEGER,
    "total_dongs" INTEGER,
    "built_year" INTEGER,
    "parking_count" INTEGER,
    "heating_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dongs" ADD CONSTRAINT "dongs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
