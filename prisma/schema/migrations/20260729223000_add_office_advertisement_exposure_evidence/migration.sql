ALTER TABLE "office_advertisements"
  ADD COLUMN "floor_info" TEXT,
  ADD COLUMN "floor_exposure_mode" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "verification_type_code" TEXT;

ALTER TABLE "office_advertisements"
  ADD CONSTRAINT "office_advertisements_floor_exposure_mode_check"
  CHECK ("floor_exposure_mode" IN ('exact', 'band', 'unknown'));
