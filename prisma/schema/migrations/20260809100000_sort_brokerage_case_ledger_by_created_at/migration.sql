DROP INDEX IF EXISTS "brokerage_cases_office_id_archived_at_updated_at_idx";

CREATE INDEX "brokerage_cases_office_id_archived_at_created_at_idx"
  ON "brokerage_cases" ("office_id", "archived_at", "created_at");

CREATE INDEX "brokerage_cases_active_created_at_idx"
  ON "brokerage_cases" ("office_id", "created_at" DESC, "id")
  WHERE "archived_at" IS NULL;
