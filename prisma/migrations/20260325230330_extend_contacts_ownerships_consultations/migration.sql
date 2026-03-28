/*
  Warnings:

  - Added the required column `created_by_id` to the `consultations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `office_id` to the `ownerships` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `ownerships` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "buyer_requirements" ADD COLUMN     "assigned_to_id" UUID,
ADD COLUMN     "deposit_max" INTEGER,
ADD COLUMN     "deposit_min" INTEGER,
ADD COLUMN     "last_contact_date" TIMESTAMP(3),
ADD COLUMN     "monthly_rent_max" INTEGER,
ADD COLUMN     "move_in_date" TIMESTAMP(3),
ADD COLUMN     "must_conditions" TEXT[],
ADD COLUMN     "next_contact_date" TIMESTAMP(3),
ADD COLUMN     "prefer_conditions" TEXT[],
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "urgency" TEXT NOT NULL DEFAULT 'normal';

-- AlterTable
ALTER TABLE "consultations" ADD COLUMN     "buyer_req_id" UUID,
ADD COLUMN     "created_by_id" UUID NOT NULL,
ADD COLUMN     "desired_price" INTEGER,
ADD COLUMN     "direction" TEXT NOT NULL DEFAULT 'outbound',
ADD COLUMN     "match_id" UUID,
ADD COLUMN     "next_contact_date" TIMESTAMP(3),
ADD COLUMN     "property_id" UUID,
ADD COLUMN     "result" TEXT;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "address" TEXT,
ADD COLUMN     "company" TEXT,
ADD COLUMN     "phone2" TEXT,
ADD COLUMN     "tags" TEXT[];

-- AlterTable
ALTER TABLE "ownerships" ADD COLUMN     "is_resident" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "memo" TEXT,
ADD COLUMN     "office_id" UUID NOT NULL,
ADD COLUMN     "share_ratio" DECIMAL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "buyer_requirements_office_id_status_idx" ON "buyer_requirements"("office_id", "status");

-- CreateIndex
CREATE INDEX "consultations_office_id_contact_id_idx" ON "consultations"("office_id", "contact_id");

-- CreateIndex
CREATE INDEX "consultations_office_id_property_id_idx" ON "consultations"("office_id", "property_id");

-- CreateIndex
CREATE INDEX "contacts_office_id_phone_idx" ON "contacts"("office_id", "phone");

-- AddForeignKey
ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_buyer_req_id_fkey" FOREIGN KEY ("buyer_req_id") REFERENCES "buyer_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_requirements" ADD CONSTRAINT "buyer_requirements_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
