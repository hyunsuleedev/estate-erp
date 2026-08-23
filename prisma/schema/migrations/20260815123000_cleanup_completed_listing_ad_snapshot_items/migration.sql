-- Completed sessions are retained as compact idempotency/audit receipts.
-- Their item rows are transient upload staging data and duplicate the local
-- immutable Reader snapshot, so remove any rows left by the previous behavior.
DELETE FROM "listing_advertisement_snapshot_items" AS "item"
USING "listing_advertisement_snapshot_sessions" AS "session"
WHERE "item"."session_id" = "session"."id"
  AND "session"."status" = 'completed';
