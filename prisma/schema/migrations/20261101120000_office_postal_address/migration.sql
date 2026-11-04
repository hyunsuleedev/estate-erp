-- Preserve existing free-text addresses; only newly selected addresses are structured.
ALTER TABLE "offices"
  ADD COLUMN "road_address" TEXT,
  ADD COLUMN "jibun_address" TEXT,
  ADD COLUMN "detail_address" TEXT,
  ADD COLUMN "zip_code" VARCHAR(5),
  ADD COLUMN "building_code" VARCHAR(25),
  ADD COLUMN "address_version" UUID,
  ADD COLUMN "geocoding_status" TEXT,
  ADD COLUMN "geocoding_error" TEXT,
  ADD COLUMN "geocoded_at" TIMESTAMP(3),
  ADD COLUMN "lat" DECIMAL,
  ADD COLUMN "lng" DECIMAL,
  ADD COLUMN "location" geometry(Point, 5179);

CREATE INDEX "offices_location_idx" ON "offices" USING GIST ("location");
ALTER TABLE "offices" ADD CONSTRAINT "offices_geocoding_status_check"
  CHECK ("geocoding_status" IS NULL OR "geocoding_status" IN ('pending', 'ready', 'failed', 'unconfigured'));
