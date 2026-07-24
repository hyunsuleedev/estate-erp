-- ============================================================
-- 상태 SSOT 재설계: 확인 파이프라인을 ListingIntake.status 로 통합
--   - Listing.check_status / check_status_changed_at 제거
--     ("거래중/완료" 는 Listing 을 점유한 Deal 에서 파생)
--   - Listing 공동중개 필드 제거 (ListingIntake 가 단일 소유)
--   - Listing.is_paused 추가 (옵션 단위 일시 중단)
--   - ListingIntake.status_changed_at 추가
--   - "Property 당 열린 의뢰 하나" partial unique index
-- ============================================================

-- ── 1. 데이터 마이그레이션 (컬럼 삭제 전) ──

-- AlterTable (데이터 마이그레이션이 참조하므로 먼저 추가)
ALTER TABLE "listing_intakes" ADD COLUMN     "status_changed_at" TIMESTAMP(3);

-- 구 intake 상태값 'active' → 'verified' (CheckStatus 값 체계로 통일)
UPDATE "listing_intakes" SET "status" = 'verified' WHERE "status" = 'active';
-- 과거에 존재했을 수 있는 비표준 값 방어
UPDATE "listing_intakes" SET "status" = 'hold' WHERE "status" = 'paused';

-- Listing 확인 상태를 의뢰로 승격: 산하 Listing 중 가장 진행된 상태를 채택
-- (파이프라인 순서: unverified < verified < hold < in_contract < done)
WITH ranked AS (
  SELECT
    l."intake_id",
    MAX(CASE l."check_status"
      WHEN 'unverified' THEN 0
      WHEN 'verified' THEN 1
      WHEN 'hold' THEN 2
      WHEN 'in_contract' THEN 3
      WHEN 'done' THEN 4
      ELSE 0
    END) AS rank,
    MAX(l."check_status_changed_at") AS changed_at
  FROM "listings" l
  GROUP BY l."intake_id"
)
UPDATE "listing_intakes" i
SET
  "status" = CASE r.rank
    WHEN 0 THEN 'unverified'
    WHEN 1 THEN 'verified'
    WHEN 2 THEN 'hold'
    WHEN 3 THEN 'in_contract'
    WHEN 4 THEN 'done'
  END,
  "status_changed_at" = r.changed_at
FROM ranked r
WHERE i."id" = r."intake_id"
  -- 의뢰가 이미 더 진행된 상태면 유지 (done 의뢰를 되돌리지 않음)
  AND CASE i."status"
    WHEN 'unverified' THEN 0
    WHEN 'verified' THEN 1
    WHEN 'hold' THEN 2
    WHEN 'in_contract' THEN 3
    WHEN 'done' THEN 4
    ELSE 0
  END < r.rank;

-- Listing 공동중개 값을 의뢰로 승격 (의뢰에 값이 없을 때만)
UPDATE "listing_intakes" i
SET
  "is_joint_brokerage_required" = true,
  "joint_brokerage_partner_id" = COALESCE(
    i."joint_brokerage_partner_id",
    (
      SELECT l."joint_brokerage_partner_id"
      FROM "listings" l
      WHERE l."intake_id" = i."id"
        AND l."joint_brokerage_partner_id" IS NOT NULL
      ORDER BY l."updated_at" DESC
      LIMIT 1
    )
  )
WHERE i."is_joint_brokerage_required" = false
  AND EXISTS (
    SELECT 1 FROM "listings" l
    WHERE l."intake_id" = i."id" AND l."is_joint_brokerage_required" = true
  );

-- partial unique index 적용 전 정리: 같은 Property 에 열린 의뢰가 여러 개면
-- 최신 것만 남기고 나머지는 done 처리
UPDATE "listing_intakes" i
SET "status" = 'done', "status_changed_at" = NOW()
WHERE i."status" IN ('unverified', 'verified', 'in_contract', 'hold')
  AND i."id" NOT IN (
    SELECT DISTINCT ON ("office_id", "property_id") "id"
    FROM "listing_intakes"
    WHERE "status" IN ('unverified', 'verified', 'in_contract', 'hold')
    ORDER BY "office_id", "property_id", "received_at" DESC, "created_at" DESC
  );

-- ── 2. 스키마 변경 ──

-- DropForeignKey
ALTER TABLE "listings" DROP CONSTRAINT "listings_joint_brokerage_partner_id_fkey";

-- DropIndex
DROP INDEX "listings_joint_brokerage_partner_id_idx";

-- DropIndex
DROP INDEX "listings_office_id_check_status_check_status_changed_at_idx";

-- DropIndex
DROP INDEX "listings_office_id_check_status_idx";

-- AlterTable
ALTER TABLE "listings" DROP COLUMN "check_status",
DROP COLUMN "check_status_changed_at",
DROP COLUMN "is_joint_brokerage_required",
DROP COLUMN "joint_brokerage_partner_id",
ADD COLUMN     "is_paused" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "listing_intakes_office_id_status_status_changed_at_idx" ON "listing_intakes"("office_id", "status", "status_changed_at");

-- ── 3. 불변식 강제 ──

-- Property 당 열린 의뢰는 하나만 (동시 생성 경쟁 방어)
CREATE UNIQUE INDEX "listing_intakes_one_open_per_property"
  ON "listing_intakes" ("office_id", "property_id")
  WHERE "status" IN ('unverified', 'verified', 'in_contract', 'hold');

-- 상태값 CHECK 제약 (서비스 검증의 DB 백스톱)
ALTER TABLE "listing_intakes" ADD CONSTRAINT "listing_intakes_status_check"
  CHECK ("status" IN ('unverified', 'verified', 'in_contract', 'hold', 'done'));
