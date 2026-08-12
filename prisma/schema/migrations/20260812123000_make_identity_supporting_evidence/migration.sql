-- 신분증은 작성 서식이 아니라 계약 당사자가 제출하는 증빙자료다.
-- 기존 계약에 보관된 문서는 유지하고, 새 문서 작성 목록과 필수 문서 산정에서만 제외한다.
UPDATE "contract_document_templates"
SET
  "is_required" = FALSE,
  "is_active" = FALSE,
  "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"documentRole":"supportingEvidence","authoredForm":false}'::jsonb,
  "updated_at" = NOW()
WHERE "code" = 'identity';
