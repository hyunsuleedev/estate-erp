-- CP 전체 재수집 한 번은 새 올림작업 한 건에만 사용할 수 있다.
-- 기존 올림작업은 legacy 데이터로 남기되, 이후 생성되는 작업부터 서버가
-- source_sync_run_id를 반드시 지정하고 sync run을 소비 처리한다.

ALTER TABLE "advertisement_sync_runs"
    ADD COLUMN "action_issue_consumed_at" TIMESTAMP(3);

ALTER TABLE "agent_action_issues"
    ADD COLUMN "source_sync_run_id" UUID;

CREATE UNIQUE INDEX "agent_action_issues_source_sync_run_id_key"
    ON "agent_action_issues"("source_sync_run_id");

ALTER TABLE "agent_action_issues"
    ADD CONSTRAINT "agent_action_issues_source_sync_run_id_fkey"
    FOREIGN KEY ("source_sync_run_id") REFERENCES "advertisement_sync_runs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
