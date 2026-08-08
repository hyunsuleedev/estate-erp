-- Matching owns property selection, viewing, and negotiation. Deal starts at contract preparation.
UPDATE "deals"
SET "stage" = 'preparing'
WHERE "stage" IN ('selection', 'negotiating');

ALTER TABLE "deals"
ALTER COLUMN "stage" SET DEFAULT 'preparing';
