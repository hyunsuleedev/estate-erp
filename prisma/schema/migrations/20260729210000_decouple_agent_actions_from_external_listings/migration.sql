-- AgentActionRequest belongs to the My Ads control plane. Its immutable
-- evidence is captured from OfficeAdvertisementGroup/OfficeAdvertisement and
-- its mutation target is ListingAdvertisement. Advertising-note
-- ExternalListing rows remain an independent bounded context.

DROP INDEX IF EXISTS "agent_action_requests_office_id_source_external_listing_id_idx";
DROP INDEX IF EXISTS "agent_action_verifications_office_id_source_external_listing_id_observed_at_idx";

ALTER TABLE "agent_action_requests"
    DROP CONSTRAINT IF EXISTS "agent_action_requests_source_external_listing_id_fkey";
ALTER TABLE "agent_action_verifications"
    DROP CONSTRAINT IF EXISTS "agent_action_verifications_source_external_listing_id_fkey";

ALTER TABLE "agent_action_requests"
    DROP COLUMN IF EXISTS "source_external_listing_id";
ALTER TABLE "agent_action_verifications"
    DROP COLUMN IF EXISTS "source_external_listing_id";

-- Keep the immutable-content trigger compatible with the corrected request
-- shape after source_external_listing_id is removed.
CREATE OR REPLACE FUNCTION prevent_agent_action_request_content_mutation()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'agent_action_requests cannot be deleted'
            USING ERRCODE = '55000';
    END IF;

    IF NEW."office_id" IS DISTINCT FROM OLD."office_id"
       OR NEW."reviewer_id" IS DISTINCT FROM OLD."reviewer_id"
       OR NEW."listing_advertisement_id" IS DISTINCT FROM OLD."listing_advertisement_id"
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
