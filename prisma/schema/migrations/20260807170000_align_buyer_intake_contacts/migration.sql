-- 최초 문의자는 통화/상담 이벤트에 남긴다. BuyerIntakeContact는 구매 프로젝트의
-- 참여 관계와 현재 주 연락 창구만 소유한다.

DROP INDEX "buyer_intake_contacts_one_requester";

ALTER TABLE "buyer_intake_contacts"
  DROP COLUMN "is_requester";

ALTER TABLE "buyer_intake_contacts"
  RENAME COLUMN "is_primary_contact" TO "is_primary";

ALTER INDEX "buyer_intake_contacts_one_primary_contact"
  RENAME TO "buyer_intake_contacts_one_primary";

-- 상담은 특정 희망조건뿐 아니라 구매 프로젝트 전체에도 직접 연결할 수 있다.
ALTER TABLE "consultations"
  ADD COLUMN "buyer_intake_id" UUID;

-- 기존 구매요건 상담은 소속 BuyerIntake를 자동으로 역참조한다.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "consultations" c
    LEFT JOIN "buyer_requirements" br
      ON br."id" = c."buyer_req_id"
     AND br."office_id" = c."office_id"
    WHERE c."buyer_req_id" IS NOT NULL
      AND br."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'consultations contains an orphan or cross-office buyer requirement';
  END IF;
END $$;

UPDATE "consultations" c
SET "buyer_intake_id" = br."buyer_intake_id"
FROM "buyer_requirements" br
WHERE c."buyer_req_id" = br."id"
  AND c."office_id" = br."office_id";

-- BuyerRequirement와 BuyerIntake를 동시에 지정한 상담이 서로 다른 프로젝트를
-- 가리키지 못하도록 복합 FK로 일관성을 강제한다.
ALTER TABLE "buyer_requirements"
  ADD CONSTRAINT "buyer_requirements_office_id_buyer_intake_id_id_key"
  UNIQUE ("office_id", "buyer_intake_id", "id");

ALTER TABLE "consultations"
  DROP CONSTRAINT "consultations_buyer_req_id_fkey";

ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_buyer_requirement_context_check"
    CHECK ("buyer_req_id" IS NULL OR "buyer_intake_id" IS NOT NULL),
  ADD CONSTRAINT "consultations_office_id_buyer_intake_id_fkey"
    FOREIGN KEY ("office_id", "buyer_intake_id")
    REFERENCES "buyer_intakes" ("office_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "consultations_office_id_buyer_intake_id_buyer_req_id_fkey"
    FOREIGN KEY ("office_id", "buyer_intake_id", "buyer_req_id")
    REFERENCES "buyer_requirements" ("office_id", "buyer_intake_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "consultations_office_id_buyer_intake_id_idx"
  ON "consultations" ("office_id", "buyer_intake_id");
