CREATE TABLE "agent_action_execution_steps" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "step_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "operation_key" VARCHAR(160),
    "message" TEXT,
    "result" JSONB,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_action_execution_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_action_execution_steps_request_id_step_key_key"
    ON "agent_action_execution_steps"("request_id", "step_key");

CREATE UNIQUE INDEX "agent_action_execution_steps_request_id_position_key"
    ON "agent_action_execution_steps"("request_id", "position");

CREATE INDEX "agent_action_execution_steps_office_request_position_idx"
    ON "agent_action_execution_steps"("office_id", "request_id", "position");

CREATE INDEX "agent_action_execution_steps_office_status_updated_idx"
    ON "agent_action_execution_steps"("office_id", "status", "updated_at");

ALTER TABLE "agent_action_execution_steps"
    ADD CONSTRAINT "agent_action_execution_steps_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_action_execution_steps"
    ADD CONSTRAINT "agent_action_execution_steps_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "agent_action_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
