-- ContactPhone에는 현재 사용 중인 canonical 번호만 저장한다.
-- 표시 형식은 클라이언트가 담당하고, 검색/CTI도 phone 컬럼 하나를 사용한다.

-- 비활성 번호와 명시적으로 과거 번호로 표시된 행은 현재 번호 집합에서 제외한다.
DELETE FROM "contact_phones"
WHERE "is_active" = false OR "label" = 'old';

-- 기존 표시용 번호를 숫자 전용 canonical 값으로 변환한다.
CREATE TEMP TABLE "_contact_phone_canonical" ON COMMIT DROP AS
WITH stripped AS (
  SELECT
    "id",
    "office_id",
    "contact_id",
    regexp_replace("phone", '[^0-9]', '', 'g') AS "digits"
  FROM "contact_phones"
)
SELECT
  "id",
  "office_id",
  "contact_id",
  CASE
    WHEN "digits" LIKE '82%' AND length("digits") > 10
      THEN '0' || substring("digits" FROM 3)
    ELSE "digits"
  END AS "phone"
FROM stripped;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "_contact_phone_canonical"
    WHERE "phone" = ''
  ) THEN
    RAISE EXCEPTION 'contact_phones contains a phone that cannot be canonicalized';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "_contact_phone_canonical"
    GROUP BY "office_id", "contact_id", "phone"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'contact_phones contains duplicates after canonicalization';
  END IF;
END $$;

UPDATE "contact_phones" AS cp
SET "phone" = canonical."phone"
FROM "_contact_phone_canonical" AS canonical
WHERE cp."id" = canonical."id";

-- 기존 데이터에 대표번호가 여러 개면 가장 먼저 등록된 번호 하나만 유지한다.
WITH ranked_primary AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "office_id", "contact_id"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS "position"
  FROM "contact_phones"
  WHERE "is_primary" = true
)
UPDATE "contact_phones" AS cp
SET "is_primary" = false
FROM ranked_primary AS ranked
WHERE cp."id" = ranked."id"
  AND ranked."position" > 1;

-- 번호가 있으나 대표번호가 없는 Contact는 가장 먼저 등록된 번호를 대표로 지정한다.
WITH first_phone AS (
  SELECT "id"
  FROM (
    SELECT
      cp."id",
      cp."office_id",
      cp."contact_id",
      row_number() OVER (
        PARTITION BY cp."office_id", cp."contact_id"
        ORDER BY cp."created_at" ASC, cp."id" ASC
      ) AS "position",
      bool_or(cp."is_primary") OVER (
        PARTITION BY cp."office_id", cp."contact_id"
      ) AS "has_primary"
    FROM "contact_phones" AS cp
  ) AS ranked
  WHERE ranked."position" = 1
    AND ranked."has_primary" = false
)
UPDATE "contact_phones" AS cp
SET "is_primary" = true
FROM first_phone
WHERE cp."id" = first_phone."id";

DROP INDEX "contact_phones_office_id_contact_id_normalized_phone_key";
DROP INDEX "contact_phones_office_id_normalized_phone_idx";

ALTER TABLE "contact_phones"
  DROP COLUMN "normalized_phone",
  DROP COLUMN "is_active";

ALTER TABLE "contact_phones"
  ADD CONSTRAINT "contact_phones_phone_digits_check"
  CHECK ("phone" ~ '^[0-9]+$');

CREATE UNIQUE INDEX "contact_phones_office_id_contact_id_phone_key"
  ON "contact_phones" ("office_id", "contact_id", "phone");

CREATE INDEX "contact_phones_office_id_phone_idx"
  ON "contact_phones" ("office_id", "phone");

CREATE UNIQUE INDEX "contact_phones_one_primary"
  ON "contact_phones" ("office_id", "contact_id")
  WHERE "is_primary" = true;
