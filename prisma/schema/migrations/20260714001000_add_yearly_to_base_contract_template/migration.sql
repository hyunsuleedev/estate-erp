-- 거래구분 연세(yearly, 레거시 Tran_Clsf 08) 지원 (G17):
-- base_contract(아파트/오피스텔/부동산/상가 계약서) 전역 템플릿의 허용
-- 거래유형에 'yearly' 를 추가한다. 멱등 (이미 있으면 건너뜀).
UPDATE "contract_document_templates"
SET "transaction_types" = array_append("transaction_types", 'yearly'),
    "updated_at" = NOW()
WHERE "code" = 'base_contract'
  AND "office_id" IS NULL
  AND NOT ('yearly' = ANY("transaction_types"));
