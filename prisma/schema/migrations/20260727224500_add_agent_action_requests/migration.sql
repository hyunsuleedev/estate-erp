-- Independent AI review queue with an exact-hash approval contract for one
-- external advertisement effect. A normal request never creates or mutates a
-- Task; escalation_task_id is populated only when human follow-up is required.
-- The first product path is attended local computer use followed by a
-- persisted-state read in Esiljang.

CREATE TABLE "agent_action_requests" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "escalation_task_id" UUID,
    "listing_advertisement_id" UUID NOT NULL,
    "source_external_listing_id" UUID NOT NULL,
    "supersedes_id" UUID,
    "capability" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "source_skill_key" TEXT,
    "source_skill_version" TEXT,
    "executor_skill_key" TEXT NOT NULL,
    "executor_skill_version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "risk_level" TEXT NOT NULL DEFAULT 'high',
    "execution_mode" TEXT NOT NULL DEFAULT 'manual',
    "payload" JSONB NOT NULL,
    "preconditions" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "base_state_hash" VARCHAR(64) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "review_status" TEXT NOT NULL DEFAULT 'pending',
    "execution_status" TEXT NOT NULL DEFAULT 'not_started',
    "verification_status" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 1,
    "dedupe_key" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_by_user_id" UUID,
    "approved_content_hash" VARCHAR(64),
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "executed_by_id" UUID,
    "executed_at" TIMESTAMP(3),
    "execution_result" JSONB,
    "verified_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_action_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_action_requests_capability_check" CHECK (
        "capability" IN ('advertisement.takedown', 'advertisement.terms.set')
    ),
    CONSTRAINT "agent_action_requests_schema_version_check" CHECK ("schema_version" = 1),
    CONSTRAINT "agent_action_requests_risk_level_check" CHECK (
        "risk_level" IN ('low', 'medium', 'high', 'critical')
    ),
    CONSTRAINT "agent_action_requests_execution_mode_check" CHECK (
        "execution_mode" IN ('manual', 'connector')
    ),
    CONSTRAINT "agent_action_requests_review_status_check" CHECK (
        "review_status" IN (
            'pending', 'approved', 'rejected', 'withdrawn',
            'expired', 'stale', 'superseded'
        )
    ),
    CONSTRAINT "agent_action_requests_execution_status_check" CHECK (
        "execution_status" IN (
            'not_started', 'awaiting_manual', 'queued', 'running',
            'succeeded', 'failed', 'needs_input', 'cancelled'
        )
    ),
    CONSTRAINT "agent_action_requests_verification_status_check" CHECK (
        "verification_status" IN (
            'pending', 'matched', 'mismatch', 'not_found',
            'blocked', 'not_required'
        )
    ),
    CONSTRAINT "agent_action_requests_version_check" CHECK ("version" > 0),
    CONSTRAINT "agent_action_requests_expiry_check" CHECK ("expires_at" > "observed_at"),
    CONSTRAINT "agent_action_requests_base_state_hash_check" CHECK (
        "base_state_hash" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "agent_action_requests_content_hash_check" CHECK (
        "content_hash" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "agent_action_requests_approved_hash_check" CHECK (
        "approved_content_hash" IS NULL
        OR "approved_content_hash" = "content_hash"
    )
);

CREATE TABLE "agent_action_verifications" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "source_external_listing_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'esiljang',
    "capture_kind" TEXT NOT NULL DEFAULT 'computer_use_postcondition',
    "result" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "state_hash" VARCHAR(64) NOT NULL,
    "capture_key" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "verified_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_action_verifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_action_verifications_provider_check" CHECK (
        "provider" = 'esiljang'
    ),
    CONSTRAINT "agent_action_verifications_capture_kind_check" CHECK (
        "capture_kind" = 'computer_use_postcondition'
    ),
    CONSTRAINT "agent_action_verifications_result_check" CHECK (
        "result" IN ('matched', 'mismatch', 'not_found', 'blocked')
    ),
    CONSTRAINT "agent_action_verifications_state_hash_check" CHECK (
        "state_hash" ~ '^[0-9a-f]{64}$'
    )
);

CREATE UNIQUE INDEX "agent_action_requests_supersedes_id_key"
    ON "agent_action_requests"("supersedes_id");
CREATE INDEX "agent_action_requests_office_id_review_status_created_at_idx"
    ON "agent_action_requests"("office_id", "review_status", "created_at");
CREATE INDEX "agent_action_requests_office_id_reviewer_id_review_status_created_at_idx"
    ON "agent_action_requests"(
        "office_id", "reviewer_id", "review_status", "created_at"
    );
CREATE INDEX "agent_action_requests_office_id_execution_status_updated_at_idx"
    ON "agent_action_requests"("office_id", "execution_status", "updated_at");
CREATE INDEX "agent_action_requests_office_id_escalation_task_id_idx"
    ON "agent_action_requests"("office_id", "escalation_task_id");
CREATE INDEX "agent_action_requests_office_id_listing_advertisement_id_idx"
    ON "agent_action_requests"("office_id", "listing_advertisement_id");
CREATE INDEX "agent_action_requests_office_id_source_external_listing_id_idx"
    ON "agent_action_requests"("office_id", "source_external_listing_id");
CREATE INDEX "agent_action_requests_content_hash_idx"
    ON "agent_action_requests"("content_hash");

-- The same observation + target command may only have one live review/execution.
CREATE UNIQUE INDEX "agent_action_requests_active_dedupe_key"
    ON "agent_action_requests"("office_id", "dedupe_key")
    WHERE "dedupe_key" IS NOT NULL
      AND "review_status" IN ('pending', 'approved')
      AND "execution_status" NOT IN ('succeeded', 'cancelled');

CREATE UNIQUE INDEX "agent_action_verifications_request_id_capture_key_key"
    ON "agent_action_verifications"("request_id", "capture_key");
CREATE INDEX "agent_action_verifications_office_id_request_id_created_at_idx"
    ON "agent_action_verifications"("office_id", "request_id", "created_at");
CREATE INDEX "agent_action_verifications_office_id_source_external_listing_id_observed_at_idx"
    ON "agent_action_verifications"(
        "office_id", "source_external_listing_id", "observed_at"
    );

ALTER TABLE "agent_action_requests"
    ADD CONSTRAINT "agent_action_requests_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_action_requests"
    ADD CONSTRAINT "agent_action_requests_reviewer_id_fkey"
    FOREIGN KEY ("reviewer_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_action_requests"
    ADD CONSTRAINT "agent_action_requests_escalation_task_id_fkey"
    FOREIGN KEY ("escalation_task_id") REFERENCES "tasks"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_action_requests"
    ADD CONSTRAINT "agent_action_requests_listing_advertisement_id_fkey"
    FOREIGN KEY ("listing_advertisement_id") REFERENCES "listing_advertisements"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_action_requests"
    ADD CONSTRAINT "agent_action_requests_source_external_listing_id_fkey"
    FOREIGN KEY ("source_external_listing_id") REFERENCES "external_listings"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_action_requests"
    ADD CONSTRAINT "agent_action_requests_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_action_requests"
    ADD CONSTRAINT "agent_action_requests_decided_by_id_fkey"
    FOREIGN KEY ("decided_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_action_requests"
    ADD CONSTRAINT "agent_action_requests_executed_by_id_fkey"
    FOREIGN KEY ("executed_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_action_requests"
    ADD CONSTRAINT "agent_action_requests_supersedes_id_fkey"
    FOREIGN KEY ("supersedes_id") REFERENCES "agent_action_requests"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_action_verifications"
    ADD CONSTRAINT "agent_action_verifications_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_action_verifications"
    ADD CONSTRAINT "agent_action_verifications_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "agent_action_requests"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_action_verifications"
    ADD CONSTRAINT "agent_action_verifications_source_external_listing_id_fkey"
    FOREIGN KEY ("source_external_listing_id") REFERENCES "external_listings"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_sessions"
    ADD COLUMN "agent_action_request_id" UUID;
CREATE INDEX "agent_sessions_office_id_agent_action_request_id_idx"
    ON "agent_sessions"("office_id", "agent_action_request_id");
ALTER TABLE "agent_sessions"
    ADD CONSTRAINT "agent_sessions_single_work_item_check"
    CHECK ("task_id" IS NULL OR "agent_action_request_id" IS NULL);
ALTER TABLE "agent_sessions"
    ADD CONSTRAINT "agent_sessions_agent_action_request_id_fkey"
    FOREIGN KEY ("agent_action_request_id") REFERENCES "agent_action_requests"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- The reviewed instruction and evidence never change in place. Decision and
-- manual-execution identity also become immutable after their first write.
CREATE FUNCTION prevent_agent_action_request_content_mutation()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'agent_action_requests cannot be deleted'
            USING ERRCODE = '55000';
    END IF;

    IF NEW."office_id" IS DISTINCT FROM OLD."office_id"
       OR NEW."reviewer_id" IS DISTINCT FROM OLD."reviewer_id"
       OR NEW."listing_advertisement_id" IS DISTINCT FROM OLD."listing_advertisement_id"
       OR NEW."source_external_listing_id" IS DISTINCT FROM OLD."source_external_listing_id"
       OR NEW."supersedes_id" IS DISTINCT FROM OLD."supersedes_id"
       OR NEW."capability" IS DISTINCT FROM OLD."capability"
       OR NEW."schema_version" IS DISTINCT FROM OLD."schema_version"
       OR NEW."source_skill_key" IS DISTINCT FROM OLD."source_skill_key"
       OR NEW."source_skill_version" IS DISTINCT FROM OLD."source_skill_version"
       OR NEW."executor_skill_key" IS DISTINCT FROM OLD."executor_skill_key"
       OR NEW."executor_skill_version" IS DISTINCT FROM OLD."executor_skill_version"
       OR NEW."title" IS DISTINCT FROM OLD."title"
       OR NEW."summary" IS DISTINCT FROM OLD."summary"
       OR NEW."rationale" IS DISTINCT FROM OLD."rationale"
       OR NEW."risk_level" IS DISTINCT FROM OLD."risk_level"
       OR NEW."execution_mode" IS DISTINCT FROM OLD."execution_mode"
       OR NEW."payload" IS DISTINCT FROM OLD."payload"
       OR NEW."preconditions" IS DISTINCT FROM OLD."preconditions"
       OR NEW."evidence" IS DISTINCT FROM OLD."evidence"
       OR NEW."base_state_hash" IS DISTINCT FROM OLD."base_state_hash"
       OR NEW."content_hash" IS DISTINCT FROM OLD."content_hash"
       OR NEW."dedupe_key" IS DISTINCT FROM OLD."dedupe_key"
       OR NEW."observed_at" IS DISTINCT FROM OLD."observed_at"
       OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
       OR NEW."created_by" IS DISTINCT FROM OLD."created_by"
       OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
       OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'agent action request reviewed content is immutable'
            USING ERRCODE = '55000';
    END IF;

    IF OLD."escalation_task_id" IS NOT NULL
       AND NEW."escalation_task_id" IS DISTINCT FROM OLD."escalation_task_id" THEN
        RAISE EXCEPTION 'agent action request escalation task is immutable once set'
            USING ERRCODE = '55000';
    END IF;

    IF OLD."decided_at" IS NOT NULL
       AND (
           NEW."approved_content_hash" IS DISTINCT FROM OLD."approved_content_hash"
           OR NEW."decided_by_id" IS DISTINCT FROM OLD."decided_by_id"
           OR NEW."decided_at" IS DISTINCT FROM OLD."decided_at"
           OR NEW."decision_note" IS DISTINCT FROM OLD."decision_note"
       ) THEN
        RAISE EXCEPTION 'agent action request decision is immutable'
            USING ERRCODE = '55000';
    END IF;

    IF (
           OLD."executed_at" IS NOT NULL
           OR OLD."execution_result" IS NOT NULL
       )
       AND (
           NEW."executed_by_id" IS DISTINCT FROM OLD."executed_by_id"
           OR NEW."executed_at" IS DISTINCT FROM OLD."executed_at"
           OR NEW."execution_result" IS DISTINCT FROM OLD."execution_result"
           OR NEW."verified_at" IS DISTINCT FROM OLD."verified_at"
       ) THEN
        RAISE EXCEPTION 'agent action request execution receipt is immutable'
            USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "agent_action_requests_content_immutable"
    BEFORE UPDATE OR DELETE ON "agent_action_requests"
    FOR EACH ROW EXECUTE FUNCTION prevent_agent_action_request_content_mutation();

CREATE FUNCTION prevent_agent_action_verification_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'agent_action_verifications are append-only'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "agent_action_verifications_append_only"
    BEFORE UPDATE OR DELETE ON "agent_action_verifications"
    FOR EACH ROW EXECUTE FUNCTION prevent_agent_action_verification_mutation();
