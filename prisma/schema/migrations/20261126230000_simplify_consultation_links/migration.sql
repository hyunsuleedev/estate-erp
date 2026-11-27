-- 상담(Consultation) 연결 축 단순화 (8개 -> 5개: property, listingIntake, buyerIntake, deal, project).
-- 1) 기존 match_id / listing_id / buyer_req_id 링크를 상위 축(property_id, listing_intake_id, buyer_intake_id)으로 무손실 승격한다.
-- 2) listing_intake_id가 있는 상담은 항상 같은 호실(property_id)을 함께 가리키도록 CHECK + 복합 FK로 강제한다.
-- 3) listing_id, match_id, buyer_req_id 컬럼과 관련 FK·인덱스를 제거한다.

-- Step 1: match_id -> property_id / listing_intake_id / buyer_intake_id 백필
UPDATE "consultations" c
SET
  "listing_intake_id" = COALESCE(c."listing_intake_id", l."intake_id"),
  "property_id" = COALESCE(c."property_id", l."property_id")
FROM "matches" m
JOIN "listings" l
  ON l."id" = m."listing_id"
 AND l."office_id" = m."office_id"
WHERE c."match_id" = m."id"
  AND c."office_id" = m."office_id"
  AND (c."listing_intake_id" IS NULL OR c."property_id" IS NULL);

UPDATE "consultations" c
SET "buyer_intake_id" = br."buyer_intake_id"
FROM "matches" m
JOIN "buyer_requirements" br
  ON br."id" = m."buyer_req_id"
 AND br."office_id" = m."office_id"
WHERE c."match_id" = m."id"
  AND c."office_id" = m."office_id"
  AND c."buyer_intake_id" IS NULL;

-- Step 2: listing_id -> listing_intake_id / property_id 백필
UPDATE "consultations" c
SET
  "listing_intake_id" = COALESCE(c."listing_intake_id", l."intake_id"),
  "property_id" = COALESCE(c."property_id", l."property_id")
FROM "listings" l
WHERE c."listing_id" = l."id"
  AND c."office_id" = l."office_id"
  AND (c."listing_intake_id" IS NULL OR c."property_id" IS NULL);

-- Step 3: buyer_req_id -> buyer_intake_id 백필
UPDATE "consultations" c
SET "buyer_intake_id" = br."buyer_intake_id"
FROM "buyer_requirements" br
WHERE c."buyer_req_id" = br."id"
  AND c."office_id" = br."office_id"
  AND c."buyer_intake_id" IS NULL;

-- Step 4: listing_intake_id가 있으면 property_id가 같은 사무소·같은 호실인지 검증하고 채운다.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "consultations" c
    LEFT JOIN "listing_intakes" li
      ON li."id" = c."listing_intake_id"
     AND li."office_id" = c."office_id"
    WHERE c."listing_intake_id" IS NOT NULL
      AND li."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'consultations contains an orphan or cross-office listing_intake_id';
  END IF;
END $$;

UPDATE "consultations" c
SET "property_id" = li."property_id"
FROM "listing_intakes" li
WHERE c."listing_intake_id" = li."id"
  AND c."office_id" = li."office_id"
  AND (c."property_id" IS NULL OR c."property_id" IS DISTINCT FROM li."property_id");

-- Step 5: listing_intakes 복합 유니크 + consultations 복합 FK & CHECK 추가
CREATE UNIQUE INDEX "listing_intakes_office_id_property_id_id_key"
  ON "listing_intakes"("office_id", "property_id", "id");

ALTER TABLE "consultations"
  DROP CONSTRAINT IF EXISTS "consultations_listing_intake_id_fkey";

ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_listing_intake_context_check"
    CHECK ("listing_intake_id" IS NULL OR "property_id" IS NOT NULL),
  ADD CONSTRAINT "consultations_office_id_property_id_listing_intake_id_fkey"
    FOREIGN KEY ("office_id", "property_id", "listing_intake_id")
    REFERENCES "listing_intakes"("office_id", "property_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 6: 제거되는 3개 연결 축(listing_id, match_id, buyer_req_id) 정리
DROP INDEX IF EXISTS "consultations_office_id_listing_id_idx";

ALTER TABLE "consultations"
  DROP CONSTRAINT IF EXISTS "consultations_listing_id_fkey",
  DROP CONSTRAINT IF EXISTS "consultations_match_id_fkey",
  DROP CONSTRAINT IF EXISTS "consultations_office_id_buyer_intake_id_buyer_req_id_fkey",
  DROP CONSTRAINT IF EXISTS "consultations_buyer_requirement_context_check";

ALTER TABLE "consultations"
  DROP COLUMN "listing_id",
  DROP COLUMN "match_id",
  DROP COLUMN "buyer_req_id";
