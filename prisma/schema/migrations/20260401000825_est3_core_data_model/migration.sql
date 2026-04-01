-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- AlterTable
ALTER TABLE "deal_participants" ADD COLUMN     "commission_amount" INTEGER,
ADD COLUMN     "commission_rate" DECIMAL,
ADD COLUMN     "settlement_date" TIMESTAMP(3),
ADD COLUMN     "settlement_status" TEXT NOT NULL DEFAULT 'unsettled';

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "location" geometry(Point, 5179);

-- CreateFunction
CREATE OR REPLACE FUNCTION sync_sites_location_from_lat_lng()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."lat" IS NULL OR NEW."lng" IS NULL THEN
    NEW."location" := NULL;
  ELSE
    NEW."location" := ST_Transform(
      ST_SetSRID(ST_MakePoint(NEW."lng"::double precision, NEW."lat"::double precision), 4326),
      5179
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CreateTrigger
CREATE TRIGGER "sites_sync_location_from_lat_lng"
BEFORE INSERT OR UPDATE OF "lat", "lng" ON "sites"
FOR EACH ROW
EXECUTE FUNCTION sync_sites_location_from_lat_lng();

-- BackfillData
UPDATE "sites"
SET "location" = ST_Transform(
  ST_SetSRID(ST_MakePoint("lng"::double precision, "lat"::double precision), 4326),
  5179
)
WHERE "lat" IS NOT NULL
  AND "lng" IS NOT NULL;

-- CreateIndex
CREATE INDEX "tasks_office_id_is_done_due_date_idx" ON "tasks"("office_id", "is_done", "due_date");

-- CreateIndex
CREATE INDEX "tasks_contact_id_idx" ON "tasks"("contact_id");

-- CreateIndex
CREATE INDEX "tasks_property_id_idx" ON "tasks"("property_id");

-- CreateIndex
CREATE INDEX "tasks_consultation_id_idx" ON "tasks"("consultation_id");

-- CreateIndex
CREATE INDEX "sites_location_idx" ON "sites" USING GIST ("location");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
