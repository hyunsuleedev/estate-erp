-- Add a lightweight display type for occupancy/unit-grid cells.
ALTER TABLE "units" ADD COLUMN "cell_type" TEXT NOT NULL DEFAULT 'unit';

-- Preserve existing piloti markers in the new grid display field.
UPDATE "units"
SET "cell_type" = 'piloti'
WHERE "is_piloti" = true;
