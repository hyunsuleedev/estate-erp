ALTER TABLE "agent_action_batches"
    ADD COLUMN "category" TEXT NOT NULL DEFAULT 'advertisement_management';

CREATE INDEX "agent_action_batches_office_category_created_idx"
    ON "agent_action_batches"("office_id", "category", "created_at");
