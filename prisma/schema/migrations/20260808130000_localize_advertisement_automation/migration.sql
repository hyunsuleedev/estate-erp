-- 광고 자동화의 사용자-visible 상태를 일반 Task로 단순화한다.
-- CP/Naver 단계, 재시도, 브라우저 실행 상태와 수집 범위는 사용자의 로컬
-- Skill SQLite가 소유하며 ERP 서버는 작업을 dispatch하거나 agent를 깨우지 않는다.

-- 기존 올림작업은 Task 한 건으로 보존한다. 세부 실행 이력은 아래 legacy
-- control-plane 테이블과 함께 제거된다.
INSERT INTO "tasks" (
    "id",
    "office_id",
    "title",
    "content",
    "source",
    "status",
    "priority",
    "category",
    "sort_order",
    "assigned_to_id",
    "created_by_id",
    "assigned_by_id",
    "assigned_at",
    "created_at",
    "updated_at"
)
SELECT
    issue."id",
    issue."office_id",
    issue."title",
    '기존 광고 자동화 작업에서 일반 업무로 전환되었습니다.',
    'ai',
    CASE
        WHEN issue."control_status" = 'cancelled' THEN 'cancelled'
        WHEN issue."control_status" = 'active' THEN 'in_progress'
        ELSE 'pending'
    END,
    'medium',
    'advertisement',
    0,
    issue."requested_by_id",
    issue."requested_by_id",
    issue."requested_by_id",
    CASE WHEN issue."requested_by_id" IS NOT NULL THEN issue."created_at" ELSE NULL END,
    issue."created_at",
    issue."updated_at"
FROM "agent_action_issues" AS issue
ON CONFLICT ("id") DO NOTHING;

DELETE FROM "notifications"
WHERE "link_type" IN ('agentActionRequest', 'agentActionIssue', 'advertisementSyncRun');

DELETE FROM "activity_logs"
WHERE "entity_type" IN (
    'agentActionRequest',
    'agentActionIssue',
    'advertisementSyncRun',
    'advertisementSyncStep'
);

DROP TABLE IF EXISTS "agent_activities" CASCADE;
DROP TABLE IF EXISTS "agent_runs" CASCADE;
DROP TABLE IF EXISTS "agent_wakeup_requests" CASCADE;
DROP TABLE IF EXISTS "agent_sessions" CASCADE;

DROP TABLE IF EXISTS "agent_action_verifications" CASCADE;
DROP TABLE IF EXISTS "agent_action_execution_steps" CASCADE;
DROP TABLE IF EXISTS "agent_action_requests" CASCADE;
DROP TABLE IF EXISTS "agent_action_runs" CASCADE;
DROP TABLE IF EXISTS "agent_action_issues" CASCADE;

DROP TABLE IF EXISTS "advertisement_sync_steps" CASCADE;
DROP TABLE IF EXISTS "advertisement_sync_runs" CASCADE;

DROP TABLE IF EXISTS "external_listing_sources" CASCADE;
