-- 사용자가 한 번 제출한 광고 묶음을 일회성 Batch가 아니라 후속 실행을
-- 계속 담을 수 있는 Issue로 승격한다. 기존 Batch는 Issue와 최초 Run으로
-- 그대로 이관한다.

ALTER TABLE "agent_action_requests"
    DROP CONSTRAINT IF EXISTS "agent_action_requests_batch_id_fkey";

ALTER TABLE "agent_action_batches"
    RENAME TO "agent_action_issues";

ALTER TABLE "agent_action_issues"
    RENAME CONSTRAINT "agent_action_batches_pkey" TO "agent_action_issues_pkey";

ALTER TABLE "agent_action_issues"
    RENAME CONSTRAINT "agent_action_batches_office_id_fkey" TO "agent_action_issues_office_id_fkey";

ALTER TABLE "agent_action_issues"
    RENAME CONSTRAINT "agent_action_batches_requested_by_id_fkey" TO "agent_action_issues_requested_by_id_fkey";

ALTER INDEX "agent_action_batches_office_created_idx"
    RENAME TO "agent_action_issues_office_created_idx";

ALTER INDEX "agent_action_batches_office_control_updated_idx"
    RENAME TO "agent_action_issues_office_control_updated_idx";

ALTER INDEX "agent_action_batches_office_category_created_idx"
    RENAME TO "agent_action_issues_office_category_created_idx";

ALTER TABLE "agent_action_issues"
    ADD COLUMN "number" INTEGER;

WITH numbered AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "office_id"
            ORDER BY "created_at", "id"
        )::INTEGER AS "number"
    FROM "agent_action_issues"
)
UPDATE "agent_action_issues" AS issue
SET "number" = numbered."number"
FROM numbered
WHERE issue."id" = numbered."id";

ALTER TABLE "agent_action_issues"
    ALTER COLUMN "number" SET NOT NULL;

CREATE UNIQUE INDEX "agent_action_issues_office_number_key"
    ON "agent_action_issues"("office_id", "number");

CREATE TABLE "agent_action_runs" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'initial',
    "requested_by_id" UUID,
    "title" TEXT,
    "note" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_action_runs_pkey" PRIMARY KEY ("id")
);

-- 테이블이 다르므로 기존 Issue id를 최초 Run id로 재사용할 수 있다.
INSERT INTO "agent_action_runs" (
    "id",
    "office_id",
    "issue_id",
    "sequence",
    "trigger",
    "requested_by_id",
    "title",
    "metadata",
    "created_at",
    "updated_at"
)
SELECT
    issue."id",
    issue."office_id",
    issue."id",
    1,
    'initial',
    issue."requested_by_id",
    '최초 요청',
    jsonb_build_object('migratedFromBatch', true),
    issue."created_at",
    issue."updated_at"
FROM "agent_action_issues" AS issue;

ALTER TABLE "agent_action_requests"
    RENAME COLUMN "batch_id" TO "issue_id";

ALTER INDEX "agent_action_requests_office_batch_created_idx"
    RENAME TO "agent_action_requests_office_issue_created_idx";

ALTER TABLE "agent_action_requests"
    ADD COLUMN "run_id" UUID;

UPDATE "agent_action_requests"
SET "run_id" = "issue_id";

ALTER TABLE "agent_action_requests"
    ALTER COLUMN "run_id" SET NOT NULL;

CREATE UNIQUE INDEX "agent_action_runs_issue_sequence_key"
    ON "agent_action_runs"("issue_id", "sequence");

CREATE INDEX "agent_action_runs_office_created_idx"
    ON "agent_action_runs"("office_id", "created_at");

CREATE INDEX "agent_action_runs_office_issue_created_idx"
    ON "agent_action_runs"("office_id", "issue_id", "created_at");

CREATE INDEX "agent_action_requests_office_run_created_idx"
    ON "agent_action_requests"("office_id", "run_id", "created_at");

ALTER TABLE "agent_action_runs"
    ADD CONSTRAINT "agent_action_runs_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_action_runs"
    ADD CONSTRAINT "agent_action_runs_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "agent_action_issues"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_action_runs"
    ADD CONSTRAINT "agent_action_runs_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_action_requests"
    ADD CONSTRAINT "agent_action_requests_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "agent_action_issues"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_action_requests"
    ADD CONSTRAINT "agent_action_requests_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "agent_action_runs"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
