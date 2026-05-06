-- ============================================================
-- Contract document automation
-- - Template checklist for required contract-stage documents
-- - Generated/uploaded/signed/submitted document tracking per contract
-- ============================================================

CREATE TABLE "contract_document_templates" (
  "id" UUID NOT NULL,
  "office_id" UUID,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "transaction_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_required" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "contract_document_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contract_documents" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "contract_id" UUID NOT NULL,
  "template_id" UUID,
  "type" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "file_url" TEXT,
  "file_size" INTEGER,
  "mime_type" TEXT,
  "generated_at" TIMESTAMP(3),
  "signed_at" TIMESTAMP(3),
  "submitted_at" TIMESTAMP(3),
  "generated_by_id" UUID,
  "external_ref_id" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "memo" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "contract_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_document_templates_office_id_code_key"
  ON "contract_document_templates"("office_id", "code");
CREATE INDEX "contract_document_templates_office_id_is_active_sort_order_idx"
  ON "contract_document_templates"("office_id", "is_active", "sort_order");

CREATE INDEX "contract_documents_office_id_contract_id_idx"
  ON "contract_documents"("office_id", "contract_id");
CREATE INDEX "contract_documents_office_id_status_idx"
  ON "contract_documents"("office_id", "status");
CREATE INDEX "contract_documents_template_id_idx"
  ON "contract_documents"("template_id");

ALTER TABLE "contract_document_templates"
  ADD CONSTRAINT "contract_document_templates_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_documents"
  ADD CONSTRAINT "contract_documents_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contract_documents"
  ADD CONSTRAINT "contract_documents_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_documents"
  ADD CONSTRAINT "contract_documents_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "contract_document_templates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract_documents"
  ADD CONSTRAINT "contract_documents_generated_by_id_fkey"
  FOREIGN KEY ("generated_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "contract_document_templates"
  ("id", "office_id", "code", "title", "category", "transaction_types", "is_required", "is_active", "sort_order", "metadata", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), NULL, 'base_contract', '계약서', 'contract', ARRAY['sale', 'jeonse', 'monthly', 'exchange', 'sublease', 'transfer', 'succession']::TEXT[], true, true, 10, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["01","02","03","04","05","06"],"mySpiderTranClsf":["01","02","03","04","05","06","07"],"mySpiderTableName":["TPCT01M"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'purchase_right_contract', '분양권 계약서', 'contract', ARRAY['sale']::TEXT[], false, true, 11, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["04"],"mySpiderForm":["SalesRightContractInputForm"],"mySpiderTableName":["TPCT01M"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'union_member_right_contract', '조합원입주권 매매계약서', 'contract', ARRAY['sale']::TEXT[], false, true, 12, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["15"],"mySpiderTableName":["TPCT32S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'commercial_premium_contract', '상가건물 임대차 권리금 계약서', 'contract', ARRAY['monthly']::TEXT[], false, true, 13, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["11"],"mySpiderTableName":["TPCT20S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'right_transfer_contract', '권리 양도 계약서', 'contract', ARRAY['transfer']::TEXT[], false, true, 14, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["06"],"mySpiderTranClsf":["06"],"mySpiderTableName":["TPCT01M"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'right_succession_contract', '권리의무 승계 계약서', 'contract', ARRAY['succession']::TEXT[], false, true, 15, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["06"],"mySpiderTranClsf":["07"],"mySpiderTableName":["TPCT01M"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'standard_lease_contract', '표준임대차계약서', 'contract', ARRAY['jeonse', 'monthly']::TEXT[], false, true, 16, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["13"],"mySpiderTableName":["TPCT18S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'commercial_standard_lease_contract', '상가건물 임대차 표준계약서', 'contract', ARRAY['jeonse', 'monthly']::TEXT[], false, true, 17, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["12"],"mySpiderTableName":["TPCT19S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'house_lease_contract', '주택임대차계약서', 'contract', ARRAY['jeonse', 'monthly']::TEXT[], false, true, 18, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["14"],"mySpiderTableName":["TPCT12S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'sublease_contract', '전대차 계약서', 'contract', ARRAY['sublease']::TEXT[], false, true, 19, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderForm":["SubleaseContractInputForm"],"mySpiderTableName":["TPCT01M"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'sublease_agreement', '전대차 동의서', 'contract', ARRAY['sublease']::TEXT[], false, true, 20, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["38"],"mySpiderTableName":["TPCT29S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'identity', '신분증', 'identity', ARRAY[]::TEXT[], true, true, 30, '{}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'broker_explanation', '중개대상물 확인설명서', 'explanation', ARRAY[]::TEXT[], true, true, 40, '{"mySpiderService":["DMSV002I01","DMSV002Q01"],"mySpiderChckSetnClsf":["1","2","3","4"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'broker_explanation_residential', '중개대상물 확인설명서 주거용', 'explanation', ARRAY['sale', 'jeonse', 'monthly']::TEXT[], false, true, 41, '{"mySpiderService":["DMSV002I01","DMSV002Q01"],"mySpiderChckSetnClsf":["1"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'broker_explanation_non_residential', '중개대상물 확인설명서 비주거용', 'explanation', ARRAY['sale', 'jeonse', 'monthly']::TEXT[], false, true, 42, '{"mySpiderService":["DMSV002I01","DMSV002Q01"],"mySpiderChckSetnClsf":["2"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'broker_explanation_land', '중개대상물 확인설명서 토지', 'explanation', ARRAY['sale', 'jeonse', 'monthly']::TEXT[], false, true, 43, '{"mySpiderService":["DMSV002I01","DMSV002Q01"],"mySpiderChckSetnClsf":["3"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'broker_explanation_special', '중개대상물 확인설명서 특수 물건', 'explanation', ARRAY['sale', 'jeonse', 'monthly']::TEXT[], false, true, 44, '{"mySpiderService":["DMSV002I01","DMSV002Q01"],"mySpiderChckSetnClsf":["4"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'registry_document', '등기 관련 서류', 'attachment', ARRAY['sale', 'jeonse', 'monthly']::TEXT[], true, true, 50, '{}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'real_estate_transaction_report', '부동산거래계약 신고서', 'report', ARRAY['sale']::TEXT[], true, true, 60, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["34"],"mySpiderTableName":["TPCT26S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'real_estate_transaction_cancel_report', '부동산거래계약 해제등 신고서', 'report', ARRAY['sale']::TEXT[], false, true, 61, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["35"],"mySpiderTableName":["TPCT25S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'house_transaction_report', '주택거래계약 신고서', 'report', ARRAY['sale']::TEXT[], false, true, 62, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["32"],"mySpiderTableName":["TPCT23S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'lease_declaration', '임대차계약 신고서', 'report', ARRAY['jeonse', 'monthly']::TEXT[], true, true, 63, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["44","47","49"],"mySpiderTableName":["TPCT30S","TPCT33S","TPCT36S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'lease_change_declaration', '임대차계약 변경신고서', 'report', ARRAY['jeonse', 'monthly']::TEXT[], false, true, 64, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["45"],"mySpiderTableName":["TPCT30S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'renewal_confirmation', '계약갱신요구권 행사 여부 확인서', 'confirmation', ARRAY['jeonse', 'monthly']::TEXT[], false, true, 70, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["48"],"mySpiderTableName":["TPCT35S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'guarantee_non_enrollment_agreement', '임대보증 미가입 임차인 동의서', 'guarantee', ARRAY['jeonse', 'monthly']::TEXT[], false, true, 71, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["50"],"mySpiderTableName":["TPCT37S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'guarantee_partial_enrollment_agreement', '임대보증 일부가입 임차인 동의서', 'guarantee', ARRAY['jeonse', 'monthly']::TEXT[], false, true, 72, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["52"],"mySpiderTableName":["TPCT39S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'jeonse_registration_not_requested', '전세권설정 미요청 확인서', 'guarantee', ARRAY['jeonse', 'monthly']::TEXT[], false, true, 73, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["51"],"mySpiderTableName":["TPCT38S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'cash_receipt_document', '현금보관증', 'receipt', ARRAY[]::TEXT[], false, true, 80, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["41"],"mySpiderTableName":["TPCT15S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'privacy_agreement', '개인정보 수집이용 동의서', 'agreement', ARRAY[]::TEXT[], false, true, 81, '{"mySpiderService":["DMSV003I01","DMSV003Q01"],"mySpiderCntrClsf":["43"],"mySpiderTableName":["TPCT16S"]}', NOW(), NOW()),
  (gen_random_uuid(), NULL, 'broker_fee_receipt', '중개보수 영수증', 'receipt', ARRAY[]::TEXT[], false, true, 90, '{"mySpiderService":["DMSV005I01","DMSV005Q01"],"mySpiderTableName":["TPCTS5S"]}', NOW(), NOW());
