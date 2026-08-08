-- Match progress belongs to Match.stage, not BuyerRequirement.status.
-- Preserve existing records while reducing the buyer lifecycle to three states.
UPDATE "buyer_requirements"
SET "status" = 'active'
WHERE "status" = 'matched';

UPDATE "buyer_requirements"
SET "status" = 'hold'
WHERE "status" = 'inactive';

ALTER TABLE "buyer_requirements"
DROP CONSTRAINT IF EXISTS "buyer_requirements_status_check";

ALTER TABLE "buyer_requirements"
ADD CONSTRAINT "buyer_requirements_status_check"
CHECK ("status" IN ('active', 'hold', 'completed'));
