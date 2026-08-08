-- 광고노트는 현재 데모 데이터만 사용하므로 기존 그룹/광고를 초기화한다.
-- 거래 자체는 보존하고, 데모 외부 광고를 향한 선택적 참조만 해제한다.
UPDATE "deals"
SET "external_listing_id" = NULL
WHERE "external_listing_id" IS NOT NULL;

DELETE FROM "external_listing_groups";

-- ExternalListingGroup의 Unit 연결과 추정 호수 필드를 제거하고
-- 일반 호수 텍스트 필드로 단순화한다.
DROP INDEX IF EXISTS "external_listing_groups_office_id_unit_id_idx";

ALTER TABLE "external_listing_groups"
  DROP CONSTRAINT IF EXISTS "external_listing_groups_unit_id_fkey",
  DROP COLUMN "unit_id",
  DROP COLUMN "inferred_ho",
  ADD COLUMN "ho" TEXT;
