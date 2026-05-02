-- AlterTable
ALTER TABLE "listings" ADD COLUMN "is_joint_brokerage_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "listings" ADD COLUMN "joint_brokerage_partner_id" UUID;

-- CreateIndex
CREATE INDEX "listings_joint_brokerage_partner_id_idx" ON "listings"("joint_brokerage_partner_id");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_joint_brokerage_partner_id_fkey" FOREIGN KEY ("joint_brokerage_partner_id") REFERENCES "partner_brokers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
