-- Durable, dependency-aware workflow for the My Advertisements full refresh.
-- AgentSession/Run remains the execution protocol; these tables are the
-- user-visible workflow control plane.

CREATE TABLE "advertisement_sync_runs" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "workflow_key" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "requested_by" TEXT NOT NULL,
    "channels" TEXT[] NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advertisement_sync_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "advertisement_sync_runs_schema_version_check"
      CHECK ("schema_version" = 1),
    CONSTRAINT "advertisement_sync_runs_status_check"
      CHECK ("status" IN (
        'queued', 'running', 'awaiting_input',
        'completed', 'failed', 'cancelled'
      ))
);

CREATE TABLE "advertisement_sync_steps" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "step_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'blocked',
    "channel" TEXT,
    "skill_key" TEXT,
    "skill_version" TEXT,
    "depends_on_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "input" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "output" JSONB,
    "error" TEXT,
    "waiting_reason" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "progress_total" INTEGER NOT NULL DEFAULT 0,
    "progress_complete" INTEGER NOT NULL DEFAULT 0,
    "progress_failed" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advertisement_sync_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "advertisement_sync_steps_status_check"
      CHECK ("status" IN (
        'blocked', 'ready', 'queued', 'running', 'succeeded',
        'failed', 'needs_input', 'skipped', 'cancelled'
      )),
    CONSTRAINT "advertisement_sync_steps_position_check" CHECK ("position" > 0),
    CONSTRAINT "advertisement_sync_steps_attempt_count_check" CHECK ("attempt_count" >= 0),
    CONSTRAINT "advertisement_sync_steps_progress_check" CHECK (
      "progress_total" >= 0
      AND "progress_complete" >= 0
      AND "progress_failed" >= 0
    )
);

ALTER TABLE "agent_sessions"
  ADD COLUMN "advertisement_sync_step_id" UUID;

ALTER TABLE "agent_sessions"
  DROP CONSTRAINT "agent_sessions_single_work_item_check";

ALTER TABLE "agent_sessions"
  ADD CONSTRAINT "agent_sessions_single_work_item_check"
  CHECK (
    num_nonnulls(
      "task_id",
      "agent_action_request_id",
      "advertisement_sync_step_id"
    ) <= 1
  );

CREATE UNIQUE INDEX "advertisement_sync_runs_one_active"
  ON "advertisement_sync_runs"("office_id", "workflow_key")
  WHERE "status" IN ('queued', 'running');

CREATE INDEX "advertisement_sync_runs_office_id_workflow_key_created_at_idx"
  ON "advertisement_sync_runs"("office_id", "workflow_key", "created_at");
CREATE INDEX "advertisement_sync_runs_office_id_status_updated_at_idx"
  ON "advertisement_sync_runs"("office_id", "status", "updated_at");

CREATE UNIQUE INDEX "advertisement_sync_steps_run_id_step_key_key"
  ON "advertisement_sync_steps"("run_id", "step_key");
CREATE UNIQUE INDEX "advertisement_sync_steps_run_id_position_key"
  ON "advertisement_sync_steps"("run_id", "position");
CREATE INDEX "advertisement_sync_steps_office_id_status_updated_at_idx"
  ON "advertisement_sync_steps"("office_id", "status", "updated_at");
CREATE INDEX "advertisement_sync_steps_office_id_skill_key_status_idx"
  ON "advertisement_sync_steps"("office_id", "skill_key", "status");
CREATE INDEX "agent_sessions_office_id_advertisement_sync_step_id_idx"
  ON "agent_sessions"("office_id", "advertisement_sync_step_id");

ALTER TABLE "advertisement_sync_runs"
  ADD CONSTRAINT "advertisement_sync_runs_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "advertisement_sync_steps"
  ADD CONSTRAINT "advertisement_sync_steps_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "advertisement_sync_steps"
  ADD CONSTRAINT "advertisement_sync_steps_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "advertisement_sync_runs"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_sessions"
  ADD CONSTRAINT "agent_sessions_advertisement_sync_step_id_fkey"
  FOREIGN KEY ("advertisement_sync_step_id")
  REFERENCES "advertisement_sync_steps"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
