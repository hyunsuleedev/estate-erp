-- DropNotNull
ALTER TABLE "comments" ALTER COLUMN "project_id" DROP NOT NULL;

-- AddColumns
ALTER TABLE "comments"
  ADD COLUMN "property_id" UUID,
  ADD COLUMN "listing_intake_id" UUID,
  ADD COLUMN "buyer_intake_id" UUID,
  ADD COLUMN "deal_id" UUID;

-- EnsureTargetUniqueKeys
CREATE UNIQUE INDEX "properties_office_id_id_key" ON "properties"("office_id", "id");
CREATE UNIQUE INDEX "deals_office_id_id_key" ON "deals"("office_id", "id");

-- AddIndexes
CREATE INDEX "comments_office_id_property_id_created_at_idx" ON "comments"("office_id", "property_id", "created_at");
CREATE INDEX "comments_office_id_listing_intake_id_created_at_idx" ON "comments"("office_id", "listing_intake_id", "created_at");
CREATE INDEX "comments_office_id_buyer_intake_id_created_at_idx" ON "comments"("office_id", "buyer_intake_id", "created_at");
CREATE INDEX "comments_office_id_deal_id_created_at_idx" ON "comments"("office_id", "deal_id", "created_at");

-- AddForeignKeys
ALTER TABLE "comments"
  ADD CONSTRAINT "comments_office_id_property_id_fkey"
  FOREIGN KEY ("office_id", "property_id") REFERENCES "properties"("office_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comments"
  ADD CONSTRAINT "comments_office_id_listing_intake_id_fkey"
  FOREIGN KEY ("office_id", "listing_intake_id") REFERENCES "listing_intakes"("office_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comments"
  ADD CONSTRAINT "comments_office_id_buyer_intake_id_fkey"
  FOREIGN KEY ("office_id", "buyer_intake_id") REFERENCES "buyer_intakes"("office_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comments"
  ADD CONSTRAINT "comments_office_id_deal_id_fkey"
  FOREIGN KEY ("office_id", "deal_id") REFERENCES "deals"("office_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EnforceSingleTargetInvariant
ALTER TABLE "comments"
  ADD CONSTRAINT "comments_single_target_check"
  CHECK (num_nonnulls("project_id", "property_id", "listing_intake_id", "buyer_intake_id", "deal_id") = 1);
