-- MySpider 문서관리 실측 카탈로그 정렬:
-- 1) 계약 단계 연세 지원, 2) 현행 Web 폼/리포트/테이블 매핑,
-- 3) 코드 49 주택임대차 신고서를 통합 코드 47과 분리.

-- MySpider처럼 거래에 아직 연결하지 않은 독립 서식 묶음도 만들 수 있게 한다.
-- deal_id의 UNIQUE 제약은 유지되며 PostgreSQL은 NULL 여러 건을 허용한다.
ALTER TABLE "contracts"
  ALTER COLUMN "deal_id" DROP NOT NULL,
  ALTER COLUMN "buyer_contact_id" DROP NOT NULL,
  ALTER COLUMN "seller_contact_id" DROP NOT NULL;

UPDATE "contract_document_templates"
SET
  "title" = '부동산 계약서',
  "transaction_types" = ARRAY['sale', 'jeonse', 'monthly', 'yearly']::TEXT[],
  "metadata" = "metadata" || '{
    "mySpiderCntrClsf":["01","02","03","05"],
    "mySpiderTranClsf":["01","02","03","08"],
    "mySpiderForm":["ContractInputForm","ContractWebForm"],
    "mySpiderReport":["ApartmentTradeContractReport","AnnexedReport"],
    "mySpiderTableName":["TPCT01M"]
  }'::JSONB,
  "updated_at" = NOW()
WHERE "office_id" IS NULL AND "code" = 'base_contract';

UPDATE "contract_document_templates"
SET
  "transaction_types" = ARRAY['jeonse', 'monthly']::TEXT[],
  "metadata" = "metadata" || '{
    "mySpiderForm":["BuildingLeasePremiumContractInputForm","BuildingPremiumWebForm"],
    "mySpiderReport":["BuildingLeasePremiumContractReport"],
    "mySpiderTableName":["TPCT20S"]
  }'::JSONB,
  "updated_at" = NOW()
WHERE "office_id" IS NULL AND "code" = 'commercial_premium_contract';

UPDATE "contract_document_templates"
SET
  "title" = '표준임대차계약서 (구 호환 별칭)',
  "is_active" = FALSE,
  "metadata" = "metadata" || '{
    "aliasOf":"private_rental_standard_lease_contract",
    "deprecatedReason":"레거시 13은 private_rental_standard_lease_contract가 정식 코드로 대체함"
  }'::JSONB,
  "updated_at" = NOW()
WHERE "office_id" IS NULL AND "code" = 'standard_lease_contract';

UPDATE "contract_document_templates"
SET
  "transaction_types" = ARRAY['sale', 'jeonse', 'monthly', 'yearly']::TEXT[],
  "updated_at" = NOW()
WHERE "office_id" IS NULL
  AND "code" IN (
    'broker_explanation_residential',
    'broker_explanation_non_residential',
    'broker_explanation_land',
    'broker_explanation_special',
    'registry_document'
  );

UPDATE "contract_document_templates"
SET
  "title" = '임대차계약 신고·변경신고서 (통합)',
  "transaction_types" = ARRAY['jeonse', 'monthly', 'yearly']::TEXT[],
  "metadata" = "metadata" || '{
    "mySpiderCntrClsf":["47"],
    "mySpiderForm":["LeaseForm","LeaseWebForm"],
    "mySpiderReport":["LeaseContractReport"],
    "mySpiderTableName":["TPCT33S"]
  }'::JSONB,
  "updated_at" = NOW()
WHERE "office_id" IS NULL AND "code" = 'lease_declaration';

UPDATE "contract_document_templates"
SET
  "title" = '임대차계약 변경신고서 (구 네이티브 서식)',
  "is_active" = FALSE,
  "metadata" = "metadata" || '{
    "mySpiderCntrClsf":["45"],
    "mySpiderForm":["LeaseChangeInputForm"],
    "mySpiderReport":["LeaseChangeReport"],
    "legacyNativeOnly":true
  }'::JSONB,
  "updated_at" = NOW()
WHERE "office_id" IS NULL AND "code" = 'lease_change_declaration';

INSERT INTO "contract_document_templates" (
  "id",
  "office_id",
  "code",
  "title",
  "category",
  "transaction_types",
  "is_required",
  "is_active",
  "sort_order",
  "metadata",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  NULL,
  'house_lease_declaration',
  '주택임대차계약 신고서',
  'report',
  ARRAY['jeonse', 'monthly', 'yearly']::TEXT[],
  FALSE,
  TRUE,
  66,
  '{
    "mySpiderService":["DMSV003I01","DMSV003Q01"],
    "mySpiderCntrClsf":["49"],
    "mySpiderForm":["HouseLeaseDeclarationInputForm","HouseReportWebForm"],
    "mySpiderReport":["HouseLeaseDeclarationReport"],
    "mySpiderTableName":["TPCT36S"]
  }'::JSONB,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM "contract_document_templates"
  WHERE "office_id" IS NULL AND "code" = 'house_lease_declaration'
);
