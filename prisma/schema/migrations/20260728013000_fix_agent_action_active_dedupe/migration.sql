-- Failed and needs-input requests are terminal or human-escalated records.
-- They must remain in history without preventing a later, freshly reviewed
-- request for the same logical effect.
DROP INDEX "agent_action_requests_active_dedupe_key";

CREATE UNIQUE INDEX "agent_action_requests_active_dedupe_key"
    ON "agent_action_requests"("office_id", "dedupe_key")
    WHERE "dedupe_key" IS NOT NULL
      AND "review_status" IN ('pending', 'approved')
      AND "execution_status" IN (
          'not_started', 'awaiting_manual', 'queued', 'running'
      );
