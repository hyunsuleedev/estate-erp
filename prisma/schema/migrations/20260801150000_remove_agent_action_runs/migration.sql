-- 올림작업의 사용자·도메인 계층을 Issue → 광고 작업 → 실행 단계로 단순화한다.
-- 기존 광고 작업은 issue_id로 이미 직접 연결되어 있으므로 그대로 보존한다.

ALTER TABLE "agent_action_requests"
    DROP CONSTRAINT IF EXISTS "agent_action_requests_run_id_fkey";

DROP INDEX IF EXISTS "agent_action_requests_office_run_created_idx";

ALTER TABLE "agent_action_requests"
    DROP COLUMN IF EXISTS "run_id";

DROP TABLE IF EXISTS "agent_action_runs";
