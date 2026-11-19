-- 통화 분석 제안에 "무엇을 바꾸려는 것인지"(대상)와 "제안할 때의 값"(원래 값)을 둔다.
-- 대상: 매물·희망조건 쪽에서 제안을 찾을 수 있게 payload 안의 id를 칸으로 꺼낸다.
-- 원래 값: 반영할 때 그 사이 값이 바뀌었는지 알기 위한 것. 이미 있는 제안은 알 수 없으므로 비워 둔다
-- (비어 있으면 예전처럼 확인 없이 반영된다).
ALTER TABLE "call_action_suggestions"
  ADD COLUMN "target_type" TEXT,
  ADD COLUMN "target_id" UUID,
  ADD COLUMN "base_values" JSONB;

-- 이미 있는 제안의 대상 채우기. id 모양이 아닌 값은 건너뛴다.
UPDATE "call_action_suggestions" s
SET "target_type" = t.target_type, "target_id" = t.target_id::uuid
FROM (
  SELECT
    "id",
    CASE "type"
      WHEN 'listing_confirm' THEN 'listing_intake'
      WHEN 'buyer_requirement_update' THEN 'buyer_requirement'
      WHEN 'buyer_requirement_create' THEN 'buyer_intake'
      WHEN 'match_stage' THEN 'match'
      WHEN 'match_create' THEN 'listing'
      ELSE CASE
        WHEN "payload"->>'listingId' IS NOT NULL THEN 'listing'
        WHEN "payload"->>'propertyId' IS NOT NULL THEN 'property'
        WHEN "payload"->>'matchId' IS NOT NULL THEN 'match'
        WHEN "payload"->>'buyerReqId' IS NOT NULL THEN 'buyer_requirement'
      END
    END AS target_type,
    CASE "type"
      WHEN 'listing_confirm' THEN "payload"->>'intakeId'
      WHEN 'buyer_requirement_update' THEN "payload"->>'buyerReqId'
      WHEN 'buyer_requirement_create' THEN "payload"->>'buyerIntakeId'
      WHEN 'match_stage' THEN "payload"->>'matchId'
      WHEN 'match_create' THEN "payload"->>'listingId'
      ELSE COALESCE("payload"->>'listingId', "payload"->>'propertyId', "payload"->>'matchId', "payload"->>'buyerReqId')
    END AS target_id
  FROM "call_action_suggestions"
) t
WHERE s."id" = t."id"
  AND t.target_type IS NOT NULL
  AND t.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

CREATE INDEX "call_action_suggestions_office_id_target_type_target_id_status_idx"
  ON "call_action_suggestions"("office_id", "target_type", "target_id", "status");
