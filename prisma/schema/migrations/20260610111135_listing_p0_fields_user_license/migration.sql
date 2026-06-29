/*
  Warnings:

  - You are about to drop the column `memo` on the `properties` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_office_id_fkey";

-- AlterTable
ALTER TABLE "contact_phones" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "loan_amount" INTEGER,
ADD COLUMN     "maintenance_fee" INTEGER,
ADD COLUMN     "maintenance_fee_includes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "premium" INTEGER,
ADD COLUMN     "private_memo" TEXT;

-- AlterTable
ALTER TABLE "properties" DROP COLUMN "memo";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "license_no" TEXT,
ADD COLUMN     "license_type" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Property 중복 방지 partial unique index (unit_id IS NULL 인 토지/단독 Property)
-- Prisma 의 @@unique([officeId, siteId, unitId])는 unit_id NULL 중복을 막지 못하므로
-- partial unique index 를 직접 추가한다. 추가 전에 기존 중복 데이터를 정리:
-- 같은 (office_id, site_id)에 unit_id IS NULL Property 가 여러 개면
-- 최신(created_at DESC) 1개만 남기고, 자식 레코드를 keeper 로 이관 후 삭제한다.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE "_dup_properties" ON COMMIT DROP AS
SELECT "id", "keep_id"
FROM (
  SELECT "id",
         FIRST_VALUE("id") OVER (
           PARTITION BY "office_id", "site_id"
           ORDER BY "created_at" DESC, "id" DESC
         ) AS "keep_id"
  FROM "properties"
  WHERE "unit_id" IS NULL
) ranked
WHERE "id" <> "keep_id";

-- property_contacts: unique(contact_id, property_id, role) 충돌 row 는 선삭제 후 이관
DELETE FROM "property_contacts" pc
USING "_dup_properties" d
WHERE pc."property_id" = d."id"
  AND EXISTS (
    SELECT 1 FROM "property_contacts" k
    WHERE k."property_id" = d."keep_id"
      AND k."contact_id" = pc."contact_id"
      AND k."role" = pc."role"
  );
UPDATE "property_contacts" pc SET "property_id" = d."keep_id"
FROM "_dup_properties" d WHERE pc."property_id" = d."id";

-- listing_intakes: partial unique(office_id, property_id) WHERE status open 충돌 방지 —
-- keeper 로 모인 뒤에도 open intake 가 1개만 남도록 나머지는 done 으로 닫는다.
UPDATE "listing_intakes" SET "status" = 'done'
WHERE "id" IN (
  SELECT li_id FROM (
    SELECT li."id" AS li_id,
           ROW_NUMBER() OVER (
             PARTITION BY li."office_id", COALESCE(d."keep_id", li."property_id")
             ORDER BY li."updated_at" DESC, li."id" DESC
           ) AS rn
    FROM "listing_intakes" li
    LEFT JOIN "_dup_properties" d ON d."id" = li."property_id"
    WHERE li."status" IN ('unverified', 'active', 'in_contract', 'hold')
      AND (
        d."id" IS NOT NULL
        OR EXISTS (SELECT 1 FROM "_dup_properties" d2 WHERE d2."keep_id" = li."property_id")
      )
  ) ranked_intakes
  WHERE rn > 1
);
UPDATE "listing_intakes" li SET "property_id" = d."keep_id"
FROM "_dup_properties" d WHERE li."property_id" = d."id";

UPDATE "listings" l SET "property_id" = d."keep_id"
FROM "_dup_properties" d WHERE l."property_id" = d."id";
UPDATE "tenants" t SET "property_id" = d."keep_id"
FROM "_dup_properties" d WHERE t."property_id" = d."id";
UPDATE "consultations" c SET "property_id" = d."keep_id"
FROM "_dup_properties" d WHERE c."property_id" = d."id";
UPDATE "tasks" t SET "property_id" = d."keep_id"
FROM "_dup_properties" d WHERE t."property_id" = d."id";
UPDATE "calendar_events" ce SET "property_id" = d."keep_id"
FROM "_dup_properties" d WHERE ce."property_id" = d."id";
UPDATE "proposals" p SET "property_id" = d."keep_id"
FROM "_dup_properties" d WHERE p."property_id" = d."id";
UPDATE "public_documents" pd SET "property_id" = d."keep_id"
FROM "_dup_properties" d WHERE pd."property_id" = d."id";
UPDATE "property_photos" pp SET "property_id" = d."keep_id"
FROM "_dup_properties" d WHERE pp."property_id" = d."id";

DELETE FROM "properties" p USING "_dup_properties" d WHERE p."id" = d."id";

-- partial unique index (prisma schema 로 표현 불가)
CREATE UNIQUE INDEX IF NOT EXISTS "properties_office_site_no_unit_key"
  ON "properties"("office_id", "site_id")
  WHERE "unit_id" IS NULL;
