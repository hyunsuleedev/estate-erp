-- AlterTable
ALTER TABLE "commission_payments" ALTER COLUMN "status" SET DEFAULT 'draft';

-- CreateTable
CREATE TABLE "entity_drafts" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "entity_id" UUID,
    "proposed_changes" JSONB NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reasoning" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "decision_mode" TEXT NOT NULL DEFAULT 'approval',
    "executor" TEXT NOT NULL DEFAULT 'server',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "snoozed_until" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "decided_by_id" UUID,
    "decision_note" TEXT,
    "executed_at" TIMESTAMP(3),
    "execution_error" TEXT,
    "result_entity_id" UUID,
    "claimed_at" TIMESTAMP(3),
    "claimed_by" TEXT,
    "lock_expires_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "generated_by" TEXT NOT NULL,
    "dedupe_key" TEXT,
    "listing_id" UUID,
    "property_id" UUID,
    "contact_id" UUID,
    "deal_id" UUID,
    "contract_id" UUID,
    "payment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_draft_comments" (
    "id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_draft_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entity_drafts_office_id_status_priority_idx" ON "entity_drafts"("office_id", "status", "priority");

-- CreateIndex
CREATE INDEX "entity_drafts_office_id_decision_mode_status_idx" ON "entity_drafts"("office_id", "decision_mode", "status");

-- CreateIndex
CREATE INDEX "entity_drafts_entity_type_entity_id_idx" ON "entity_drafts"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "entity_drafts_listing_id_idx" ON "entity_drafts"("listing_id");

-- CreateIndex
CREATE INDEX "entity_drafts_deal_id_idx" ON "entity_drafts"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "entity_drafts_office_id_dedupe_key_key" ON "entity_drafts"("office_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "entity_draft_comments_draft_id_created_at_idx" ON "entity_draft_comments"("draft_id", "created_at");

-- AddForeignKey
ALTER TABLE "entity_drafts" ADD CONSTRAINT "entity_drafts_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_draft_comments" ADD CONSTRAINT "entity_draft_comments_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "entity_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_draft_comments" ADD CONSTRAINT "entity_draft_comments_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
