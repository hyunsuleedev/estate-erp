-- ListingIntake는 Property 중심의 접수 원장이다. 최초 연락자는 통화/상담
-- 이벤트에 남기고, 지속적인 연락 관계와 주 연락처는 PropertyContact가 소유한다.

-- requester_contact_id를 제거하기 전에 기존 연결 정보는 PropertyContact로 보존한다.
-- tenant 경계가 이미 어긋난 데이터는 다른 사무소 Contact를 연결하지 않고 중단한다.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "listing_intakes" li
    LEFT JOIN "contacts" c
      ON c."id" = li."requester_contact_id"
     AND c."office_id" = li."office_id"
    WHERE li."requester_contact_id" IS NOT NULL
      AND c."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'listing_intakes contains a cross-office requester contact';
  END IF;
END $$;

-- 레거시 seed가 사용하던 verified는 PropertyContact의 정식 활성 상태인 active로 통일한다.
UPDATE "property_contacts"
SET "status" = 'active'
WHERE "status" = 'verified';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "property_contacts"
    WHERE "status" NOT IN ('active', 'transferred', 'archived')
  ) THEN
    RAISE EXCEPTION 'property_contacts contains an invalid status';
  END IF;
END $$;

-- 비활성 관계는 현재 주 연락처가 될 수 없다.
UPDATE "property_contacts"
SET "is_primary" = false
WHERE "status" <> 'active'
  AND "is_primary" = true;

-- 과거에는 유일성 제약이 없었다. 같은 Property의 활성 주 연락처가 여러 명이면
-- 가장 최근에 갱신된 한 명만 유지한다.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "office_id", "property_id"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS rn
  FROM "property_contacts"
  WHERE "status" = 'active'
    AND "is_primary" = true
)
UPDATE "property_contacts" pc
SET "is_primary" = false
FROM ranked r
WHERE pc."id" = r."id"
  AND r.rn > 1;

-- requester가 해당 Property와 전혀 연결되어 있지 않다면 관계를 보존한다.
-- 열린 의뢰에 등장하면 active, 종료된 과거 의뢰에만 등장하면 archived로 이관한다.
WITH requester_links AS (
  SELECT
    li."office_id",
    li."property_id",
    li."requester_contact_id" AS "contact_id",
    BOOL_OR(li."lifecycle_status" IN ('open', 'hold')) AS "has_open_intake",
    MIN(li."created_at") AS "created_at",
    MAX(li."updated_at") AS "updated_at"
  FROM "listing_intakes" li
  WHERE li."requester_contact_id" IS NOT NULL
  GROUP BY li."office_id", li."property_id", li."requester_contact_id"
)
INSERT INTO "property_contacts" (
  "id",
  "office_id",
  "contact_id",
  "property_id",
  "role",
  "share_ratio",
  "is_resident",
  "is_primary",
  "status",
  "memo",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  rl."office_id",
  rl."contact_id",
  rl."property_id",
  'representative',
  NULL,
  false,
  false,
  CASE WHEN rl."has_open_intake" THEN 'active' ELSE 'archived' END,
  NULL,
  rl."created_at",
  rl."updated_at"
FROM requester_links rl
WHERE NOT EXISTS (
  SELECT 1
  FROM "property_contacts" pc
  WHERE pc."office_id" = rl."office_id"
    AND pc."property_id" = rl."property_id"
    AND pc."contact_id" = rl."contact_id"
);

-- 명시적으로 지정된 활성 주 연락처가 없는 Property에 한해서, 가장 최근의
-- 열린 의뢰 requester를 기존 데이터의 주 연락처로 승격한다.
WITH recent_requester AS (
  SELECT
    li."office_id",
    li."property_id",
    li."requester_contact_id" AS "contact_id",
    ROW_NUMBER() OVER (
      PARTITION BY li."office_id", li."property_id"
      ORDER BY li."received_at" DESC, li."created_at" DESC, li."id" DESC
    ) AS rn
  FROM "listing_intakes" li
  WHERE li."requester_contact_id" IS NOT NULL
    AND li."lifecycle_status" IN ('open', 'hold')
), selected_contact AS (
  SELECT
    rr."office_id",
    rr."property_id",
    pc."id" AS "property_contact_id",
    ROW_NUMBER() OVER (
      PARTITION BY rr."office_id", rr."property_id"
      ORDER BY
        CASE pc."role"
          WHEN 'owner' THEN 0
          WHEN 'co_owner' THEN 1
          WHEN 'representative' THEN 2
          ELSE 3
        END,
        pc."updated_at" DESC,
        pc."id" DESC
    ) AS pc_rn
  FROM recent_requester rr
  JOIN "property_contacts" pc
    ON pc."office_id" = rr."office_id"
   AND pc."property_id" = rr."property_id"
   AND pc."contact_id" = rr."contact_id"
   AND pc."status" = 'active'
  WHERE rr.rn = 1
    AND NOT EXISTS (
      SELECT 1
      FROM "property_contacts" primary_pc
      WHERE primary_pc."office_id" = rr."office_id"
        AND primary_pc."property_id" = rr."property_id"
        AND primary_pc."status" = 'active'
        AND primary_pc."is_primary" = true
    )
)
UPDATE "property_contacts" pc
SET "is_primary" = true
FROM selected_contact sc
WHERE pc."id" = sc."property_contact_id"
  AND sc.pc_rn = 1;

ALTER TABLE "property_contacts"
  ADD CONSTRAINT "property_contacts_status_check"
  CHECK ("status" IN ('active', 'transferred', 'archived'));

-- Property당 현재 사용되는 대표 연락 창구는 최대 한 명이다.
CREATE UNIQUE INDEX "property_contacts_one_active_primary_per_property"
  ON "property_contacts" ("office_id", "property_id")
  WHERE "is_primary" = true AND "status" = 'active';

ALTER TABLE "listing_intakes"
  DROP CONSTRAINT IF EXISTS "listing_intakes_requester_contact_id_fkey";

DROP INDEX IF EXISTS "listing_intakes_requester_contact_id_idx";

ALTER TABLE "listing_intakes"
  DROP COLUMN "requester_contact_id";
