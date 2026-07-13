-- Paperclip-style durable agent control plane.
-- Proposal/EntityDraft remain the approval domain; these tables track execution.

-- The original EntityDraft constraint reserved a dedupe key forever, including
-- after completion/failure. Keep lookup support, but only active work is unique.
DROP INDEX "entity_drafts_office_id_dedupe_key_key";

CREATE INDEX "entity_drafts_office_id_dedupe_key_idx"
    ON "entity_drafts"("office_id", "dedupe_key");

CREATE UNIQUE INDEX "entity_drafts_active_dedupe_key"
    ON "entity_drafts"("office_id", "dedupe_key")
    WHERE "dedupe_key" IS NOT NULL
      AND "status" IN ('pending', 'processing', 'approved', 'executing');

CREATE INDEX "entity_drafts_executing_lock_expires_at_idx"
    ON "entity_drafts"("lock_expires_at")
    WHERE "status" = 'executing';

CREATE TABLE "agent_sessions" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "agent_key" TEXT NOT NULL,
    "adapter" TEXT NOT NULL DEFAULT 'mcp',
    "task_id" UUID,
    "task_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "waiting_reason" TEXT,
    "context" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "plan" JSONB,
    "last_run_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_sessions_status_check" CHECK (
        "status" IN ('pending', 'active', 'awaiting_input', 'complete', 'error', 'stale')
    )
);

CREATE TABLE "agent_wakeup_requests" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "idempotency_key" TEXT,
    "coalesced_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "requested_by" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_by" TEXT,
    "claimed_at" TIMESTAMP(3),
    "lease_expires_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "agent_wakeup_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_wakeup_requests_status_check" CHECK (
        "status" IN ('queued', 'claimed', 'completed', 'failed', 'cancelled')
    ),
    CONSTRAINT "agent_wakeup_requests_coalesced_count_check" CHECK ("coalesced_count" >= 0),
    CONSTRAINT "agent_wakeup_requests_max_attempts_check" CHECK ("max_attempts" BETWEEN 1 AND 20)
);

CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "wakeup_request_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "trigger" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "worker_id" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "result" JSONB,
    "usage" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_runs_status_check" CHECK (
        "status" IN ('queued', 'running', 'completed', 'failed', 'cancelled')
    ),
    CONSTRAINT "agent_runs_attempt_check" CHECK ("attempt" > 0)
);

CREATE TABLE "agent_activities" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "run_id" UUID,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "payload" JSONB,
    "ephemeral" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_activities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_activities_sequence_check" CHECK ("sequence" > 0),
    CONSTRAINT "agent_activities_type_check" CHECK (
        "type" IN ('thought', 'action', 'elicitation', 'response', 'error', 'system')
    )
);

CREATE UNIQUE INDEX "agent_sessions_office_id_agent_key_adapter_task_key_key"
    ON "agent_sessions"("office_id", "agent_key", "adapter", "task_key");
CREATE INDEX "agent_sessions_office_id_status_updated_at_idx"
    ON "agent_sessions"("office_id", "status", "updated_at");
CREATE INDEX "agent_sessions_office_id_task_id_idx"
    ON "agent_sessions"("office_id", "task_id");

CREATE INDEX "agent_wakeup_requests_office_id_status_requested_at_idx"
    ON "agent_wakeup_requests"("office_id", "status", "requested_at");
CREATE INDEX "agent_wakeup_requests_session_id_requested_at_idx"
    ON "agent_wakeup_requests"("session_id", "requested_at");

-- A completed/failed wakeup releases the key so the same business event can be
-- requested again later. Concurrent active duplicates are coalesced by service.
CREATE UNIQUE INDEX "agent_wakeup_requests_active_idempotency_key"
    ON "agent_wakeup_requests"("office_id", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL
      AND "status" IN ('queued', 'claimed');

CREATE UNIQUE INDEX "agent_runs_wakeup_request_id_attempt_key"
    ON "agent_runs"("wakeup_request_id", "attempt");
CREATE INDEX "agent_runs_office_id_status_created_at_idx"
    ON "agent_runs"("office_id", "status", "created_at");
CREATE INDEX "agent_runs_session_id_created_at_idx"
    ON "agent_runs"("session_id", "created_at");

CREATE UNIQUE INDEX "agent_activities_session_id_sequence_key"
    ON "agent_activities"("session_id", "sequence");
CREATE INDEX "agent_activities_office_id_created_at_idx"
    ON "agent_activities"("office_id", "created_at");
CREATE INDEX "agent_activities_run_id_sequence_idx"
    ON "agent_activities"("run_id", "sequence");

ALTER TABLE "agent_wakeup_requests"
    ADD CONSTRAINT "agent_wakeup_requests_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_runs"
    ADD CONSTRAINT "agent_runs_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_runs"
    ADD CONSTRAINT "agent_runs_wakeup_request_id_fkey"
    FOREIGN KEY ("wakeup_request_id") REFERENCES "agent_wakeup_requests"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_activities"
    ADD CONSTRAINT "agent_activities_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_activities"
    ADD CONSTRAINT "agent_activities_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Activities are an audit stream: even privileged application code must append
-- a correcting event instead of rewriting or deleting history.
CREATE FUNCTION prevent_agent_activity_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'agent_activities are append-only'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "agent_activities_append_only"
    BEFORE UPDATE OR DELETE ON "agent_activities"
    FOR EACH ROW EXECUTE FUNCTION prevent_agent_activity_mutation();

-- Bind review requests to the persistent session/run that produced them.
ALTER TABLE "entity_drafts"
    ADD COLUMN "agent_session_id" UUID,
    ADD COLUMN "requested_by_run_id" UUID;

CREATE INDEX "entity_drafts_agent_session_id_status_idx"
    ON "entity_drafts"("agent_session_id", "status");
CREATE INDEX "entity_drafts_requested_by_run_id_idx"
    ON "entity_drafts"("requested_by_run_id");

ALTER TABLE "agent_sessions"
    ADD CONSTRAINT "agent_sessions_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_sessions"
    ADD CONSTRAINT "agent_sessions_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_wakeup_requests"
    ADD CONSTRAINT "agent_wakeup_requests_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_runs"
    ADD CONSTRAINT "agent_runs_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_activities"
    ADD CONSTRAINT "agent_activities_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entity_drafts"
    ADD CONSTRAINT "entity_drafts_agent_session_id_fkey"
    FOREIGN KEY ("agent_session_id") REFERENCES "agent_sessions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "entity_drafts"
    ADD CONSTRAINT "entity_drafts_requested_by_run_id_fkey"
    FOREIGN KEY ("requested_by_run_id") REFERENCES "agent_runs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
