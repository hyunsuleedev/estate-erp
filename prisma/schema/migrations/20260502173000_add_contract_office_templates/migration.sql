-- ============================================================
-- Contract office reusable templates
-- - OfficePrintTemplate: cover/receipt/ledger/settlement/notice output options
-- - ContractClauseTemplate: reusable clauses, special terms, confirmation text
-- ============================================================

CREATE TABLE "office_print_templates" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "transaction_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "data" JSONB NOT NULL DEFAULT '{}',
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "office_print_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contract_clause_templates" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "contract_kind" TEXT,
  "transaction_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "contract_clause_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "office_print_templates_office_id_type_is_active_idx"
  ON "office_print_templates"("office_id", "type", "is_active");
CREATE INDEX "office_print_templates_office_id_is_default_idx"
  ON "office_print_templates"("office_id", "is_default");

CREATE INDEX "contract_clause_templates_office_id_type_is_active_sort_ord_idx"
  ON "contract_clause_templates"("office_id", "type", "is_active", "sort_order");
CREATE INDEX "contract_clause_templates_office_id_contract_kind_idx"
  ON "contract_clause_templates"("office_id", "contract_kind");

ALTER TABLE "office_print_templates"
  ADD CONSTRAINT "office_print_templates_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "office_print_templates"
  ADD CONSTRAINT "office_print_templates_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract_clause_templates"
  ADD CONSTRAINT "contract_clause_templates_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contract_clause_templates"
  ADD CONSTRAINT "contract_clause_templates_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
