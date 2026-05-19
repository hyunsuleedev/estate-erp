ALTER TABLE "listing_intakes"
  ADD COLUMN "confirm_status" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "next_confirm_at" TIMESTAMP(3),
  ADD COLUMN "last_confirm_memo" TEXT,
  ADD COLUMN "last_confirm_consultation_id" UUID;

ALTER TABLE "consultations"
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'general';

CREATE INDEX "listing_intakes_office_id_confirm_status_next_confirm_at_idx"
  ON "listing_intakes"("office_id", "confirm_status", "next_confirm_at");

CREATE INDEX "listing_intakes_next_confirm_at_idx"
  ON "listing_intakes"("next_confirm_at");

CREATE INDEX "listing_intakes_last_confirm_consultation_id_idx"
  ON "listing_intakes"("last_confirm_consultation_id");

CREATE INDEX "consultations_office_id_purpose_idx"
  ON "consultations"("office_id", "purpose");

ALTER TABLE "listing_intakes"
  ADD CONSTRAINT "listing_intakes_last_confirm_consultation_id_fkey"
  FOREIGN KEY ("last_confirm_consultation_id")
  REFERENCES "consultations"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
