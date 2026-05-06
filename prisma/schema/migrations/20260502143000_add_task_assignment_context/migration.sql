-- Add assignment metadata and additional CRM context links to tasks.

ALTER TABLE "tasks"
  ADD COLUMN "created_by_id" UUID,
  ADD COLUMN "assigned_by_id" UUID,
  ADD COLUMN "assigned_at" TIMESTAMP(3),
  ADD COLUMN "buyer_req_id" UUID,
  ADD COLUMN "match_id" UUID,
  ADD COLUMN "deal_id" UUID,
  ADD COLUMN "contract_id" UUID;

CREATE INDEX "tasks_office_id_created_by_id_idx" ON "tasks"("office_id", "created_by_id");
CREATE INDEX "tasks_office_id_assigned_by_id_idx" ON "tasks"("office_id", "assigned_by_id");
CREATE INDEX "tasks_buyer_req_id_idx" ON "tasks"("buyer_req_id");
CREATE INDEX "tasks_match_id_idx" ON "tasks"("match_id");
CREATE INDEX "tasks_deal_id_idx" ON "tasks"("deal_id");
CREATE INDEX "tasks_contract_id_idx" ON "tasks"("contract_id");

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "tasks_assigned_by_id_fkey"
    FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "tasks_buyer_req_id_fkey"
    FOREIGN KEY ("buyer_req_id") REFERENCES "buyer_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "tasks_match_id_fkey"
    FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "tasks_deal_id_fkey"
    FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "tasks_contract_id_fkey"
    FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
