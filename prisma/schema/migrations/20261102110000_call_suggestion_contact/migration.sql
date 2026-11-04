-- 제안을 분석할 때의 통화 상대 (통화 연락처가 바뀌면 이전 고객 기준 제안을 반영하지 않는다)
ALTER TABLE "call_action_suggestions" ADD COLUMN "contact_id" UUID;
