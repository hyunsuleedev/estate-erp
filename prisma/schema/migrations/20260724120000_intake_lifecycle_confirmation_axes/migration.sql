-- ============================================================
-- ListingIntake 상태 축 분리
--   - 생명주기: lifecycle_status = open | hold | closed
--   - 확인: last_checked_at / last_verified_at / last_check_result
--   - 거래중/완료: Listing을 점유한 Deal에서만 파생
-- ============================================================

-- 1. 새 축 추가. 백필이 끝날 때까지 nullable/default로 짧게 유지한다.
ALTER TABLE "listing_intakes"
  ADD COLUMN "lifecycle_status" TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN "lifecycle_changed_at" TIMESTAMP(3),
  ADD COLUMN "lifecycle_changed_by" TEXT,
  ADD COLUMN "closed_reason" TEXT,
  ADD COLUMN "last_checked_at" TIMESTAMP(3),
  ADD COLUMN "last_verified_at" TIMESTAMP(3),
  ADD COLUMN "last_check_result" TEXT;

-- 2. 레거시 상태를 독립 축으로 백필한다.
UPDATE "listing_intakes"
SET
  "lifecycle_status" = CASE
    WHEN "status" = 'hold' THEN 'hold'
    WHEN "status" = 'done' THEN 'closed'
    ELSE 'open'
  END,
  "lifecycle_changed_at" = COALESCE("status_changed_at", "updated_at"),
  "lifecycle_changed_by" = COALESCE("status_changed_by", 'user'),
  "closed_reason" = CASE
    WHEN "status" = 'done' AND "status_changed_by" = 'system:deal'
      THEN 'deal_completed'
    WHEN "status" = 'done'
      THEN 'other'
    ELSE NULL
  END,
  "last_checked_at" = "confirmed_at",
  "last_verified_at" = CASE
    WHEN "confirmed_at" IS NOT NULL THEN "confirmed_at"
    WHEN "status" <> 'unverified' THEN COALESCE("status_changed_at", "updated_at")
    ELSE NULL
  END,
  "last_check_result" = CASE
    WHEN "confirmed_at" IS NOT NULL OR "status" <> 'unverified' THEN 'alive'
    ELSE NULL
  END;

-- lastVerifiedAt를 레거시 상태로 보완한 행은 확인 시각도 함께 보완한다.
UPDATE "listing_intakes"
SET "last_checked_at" = "last_verified_at"
WHERE "last_checked_at" IS NULL
  AND "last_verified_at" IS NOT NULL;

-- 모든 기존 행 백필 후 앞으로의 쓰기도 생명주기 메타데이터를 빠뜨릴 수 없게 한다.
ALTER TABLE "listing_intakes"
  ALTER COLUMN "lifecycle_changed_at" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "lifecycle_changed_at" SET NOT NULL,
  ALTER COLUMN "lifecycle_changed_by" SET DEFAULT 'user',
  ALTER COLUMN "lifecycle_changed_by" SET NOT NULL;

-- 3. 구 상태 제약/인덱스를 제거한다.
DROP INDEX IF EXISTS "listing_intakes_office_id_property_id_open_key";
DROP INDEX IF EXISTS "listing_intakes_one_open_per_property";
DROP INDEX IF EXISTS "listing_intakes_office_id_status_updated_at_idx";
DROP INDEX IF EXISTS "listing_intakes_office_id_status_status_changed_at_idx";
ALTER TABLE "listing_intakes"
  DROP CONSTRAINT IF EXISTS "listing_intakes_status_check";

-- 4. 새 불변식과 조회 인덱스.
ALTER TABLE "listing_intakes"
  ADD CONSTRAINT "listing_intakes_lifecycle_status_check"
    CHECK ("lifecycle_status" IN ('open', 'hold', 'closed')),
  ADD CONSTRAINT "listing_intakes_lifecycle_changed_by_check"
    CHECK ("lifecycle_changed_by" IS NULL OR "lifecycle_changed_by" IN ('user', 'system:deal')),
  ADD CONSTRAINT "listing_intakes_closed_reason_check"
    CHECK (
      ("lifecycle_status" = 'closed'
        AND "closed_reason" IN ('withdrawn', 'unavailable', 'deal_completed', 'superseded', 'other'))
      OR
      ("lifecycle_status" <> 'closed' AND "closed_reason" IS NULL)
    ),
  ADD CONSTRAINT "listing_intakes_last_check_result_check"
    CHECK (
      "last_check_result" IS NULL
      OR "last_check_result" IN ('alive', 'price_changed', 'unavailable', 'no_answer', 'pending')
    ),
  ADD CONSTRAINT "listing_intakes_check_attempt_pair_check"
    CHECK (
      ("last_checked_at" IS NULL AND "last_check_result" IS NULL)
      OR
      ("last_checked_at" IS NOT NULL AND "last_check_result" IS NOT NULL)
    ),
  ADD CONSTRAINT "listing_intakes_verified_not_after_checked_check"
    CHECK (
      "last_verified_at" IS NULL
      OR (
        "last_checked_at" IS NOT NULL
        AND "last_verified_at" <= "last_checked_at"
      )
    );

CREATE UNIQUE INDEX "listing_intakes_one_non_closed_per_property"
  ON "listing_intakes" ("office_id", "property_id")
  WHERE "lifecycle_status" IN ('open', 'hold');

CREATE INDEX "listing_intakes_office_id_lifecycle_status_updated_at_idx"
  ON "listing_intakes" ("office_id", "lifecycle_status", "updated_at");
CREATE INDEX "listing_intakes_office_id_lifecycle_status_lifecycle_changed_at_idx"
  ON "listing_intakes" ("office_id", "lifecycle_status", "lifecycle_changed_at");
CREATE INDEX "listing_intakes_office_id_last_verified_at_idx"
  ON "listing_intakes" ("office_id", "last_verified_at");
CREATE INDEX "listing_intakes_office_id_last_check_result_last_checked_at_idx"
  ON "listing_intakes" ("office_id", "last_check_result", "last_checked_at");

-- 5. 레거시 혼합 상태 컬럼 제거.
ALTER TABLE "listing_intakes"
  DROP COLUMN "status",
  DROP COLUMN "status_changed_at",
  DROP COLUMN "status_changed_by",
  DROP COLUMN "confirmed_at";
