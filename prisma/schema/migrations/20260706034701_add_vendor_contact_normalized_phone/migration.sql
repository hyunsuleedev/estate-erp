-- DropIndex
DROP INDEX "vendor_contacts_phone_idx";

-- AlterTable: nullable로 추가 → 기존 행 백필 → NOT NULL 전환
ALTER TABLE "vendor_contacts" ADD COLUMN "normalized_phone" TEXT;

-- 백필: contacts의 normalizePhone(contact-phone.utils.ts)과 동일 규칙
-- (공백/하이픈/괄호 제거, +82 → 0, 82 프리픽스(길이>10) → 0)
UPDATE "vendor_contacts"
SET "normalized_phone" = (
  CASE
    WHEN regexp_replace("phone", '[\s\-()]', '', 'g') LIKE '+82%'
      THEN '0' || substring(regexp_replace("phone", '[\s\-()]', '', 'g') FROM 4)
    WHEN regexp_replace("phone", '[\s\-()]', '', 'g') LIKE '82%'
         AND length(regexp_replace("phone", '[\s\-()]', '', 'g')) > 10
      THEN '0' || substring(regexp_replace("phone", '[\s\-()]', '', 'g') FROM 3)
    ELSE regexp_replace("phone", '[\s\-()]', '', 'g')
  END
);

ALTER TABLE "vendor_contacts" ALTER COLUMN "normalized_phone" SET NOT NULL;

-- CreateIndex
CREATE INDEX "vendor_contacts_normalized_phone_idx" ON "vendor_contacts"("normalized_phone");
