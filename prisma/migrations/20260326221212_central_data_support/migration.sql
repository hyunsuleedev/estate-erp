-- DropForeignKey
ALTER TABLE "dongs" DROP CONSTRAINT "dongs_office_id_fkey";

-- DropForeignKey
ALTER TABLE "sites" DROP CONSTRAINT "sites_office_id_fkey";

-- DropForeignKey
ALTER TABLE "units" DROP CONSTRAINT "units_office_id_fkey";

-- AlterTable
ALTER TABLE "dongs" ALTER COLUMN "office_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "is_locked" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "office_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "unit_type" TEXT,
ALTER COLUMN "office_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "office_sites" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "office_sites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "office_sites_office_id_site_id_key" ON "office_sites"("office_id", "site_id");

-- CreateIndex
CREATE INDEX "sites_office_id_idx" ON "sites"("office_id");

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_sites" ADD CONSTRAINT "office_sites_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_sites" ADD CONSTRAINT "office_sites_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dongs" ADD CONSTRAINT "dongs_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
