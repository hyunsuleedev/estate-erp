/*
  Warnings:

  - You are about to drop the `insight_rules` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "insight_rules" DROP CONSTRAINT "insight_rules_office_id_fkey";

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "check_status_changed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "offices" ADD COLUMN     "agent_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "agent_trust_config" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "mcp_permission_defaults" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mcp_permissions" JSONB;

-- DropTable
DROP TABLE "insight_rules";

-- CreateTable
CREATE TABLE "rules" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "trigger_type" TEXT NOT NULL,
    "schedule" TEXT,
    "event_name" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reasoning" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "trust_tier" TEXT NOT NULL,
    "action_type" TEXT,
    "action_payload" JSONB,
    "generated_by" TEXT NOT NULL,
    "dedupe_key" TEXT,
    "created_by_user_id" UUID,
    "listing_id" UUID,
    "property_id" UUID,
    "contact_id" UUID,
    "deal_id" UUID,
    "contract_id" UUID,
    "tenant_id" UUID,
    "proposed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "decided_by" UUID,
    "decision_note" TEXT,
    "executed_at" TIMESTAMP(3),
    "execution_error" TEXT,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rules_office_id_is_active_trigger_type_idx" ON "rules"("office_id", "is_active", "trigger_type");

-- CreateIndex
CREATE UNIQUE INDEX "rules_office_id_name_key" ON "rules"("office_id", "name");

-- CreateIndex
CREATE INDEX "proposals_office_id_status_priority_proposed_at_idx" ON "proposals"("office_id", "status", "priority", "proposed_at");

-- CreateIndex
CREATE INDEX "proposals_office_id_type_status_idx" ON "proposals"("office_id", "type", "status");

-- CreateIndex
CREATE INDEX "proposals_office_id_dedupe_key_idx" ON "proposals"("office_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "proposals_listing_id_idx" ON "proposals"("listing_id");

-- CreateIndex
CREATE INDEX "proposals_property_id_idx" ON "proposals"("property_id");

-- CreateIndex
CREATE INDEX "listings_office_id_check_status_check_status_changed_at_idx" ON "listings"("office_id", "check_status", "check_status_changed_at");

-- CreateIndex
CREATE INDEX "tenants_office_id_status_contract_end_idx" ON "tenants"("office_id", "status", "contract_end");

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
