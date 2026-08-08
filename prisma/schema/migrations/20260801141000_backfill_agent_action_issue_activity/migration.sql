UPDATE "activity_logs"
SET "entity_type" = 'agentActionIssue'
WHERE "entity_type" = 'agentActionBatch'
  AND EXISTS (
    SELECT 1
    FROM "agent_action_issues" AS issue
    WHERE issue."id" = "activity_logs"."entity_id"
  );
