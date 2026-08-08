CREATE TABLE "agent_action_batches" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "requested_by_id" UUID,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'my_ads',
    "control_status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "paused_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_action_batches_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agent_action_requests"
    ADD COLUMN "batch_id" UUID;

-- 단계 추적 도입 전에 만들어진 단건 요청도 동일한 관제 화면에서 보이도록
-- 요청 한 건당 singleton batch로 이관한다. 테이블이 다르므로 request id를
-- batch id로 재사용해도 충돌하지 않고 안정적인 backfill 키가 된다.
INSERT INTO "agent_action_batches" (
    "id",
    "office_id",
    "requested_by_id",
    "title",
    "source",
    "control_status",
    "metadata",
    "version",
    "created_at",
    "updated_at"
)
SELECT
    request."id",
    request."office_id",
    request."created_by_user_id",
    request."title",
    'migration',
    'active',
    jsonb_build_object('legacySingleton', true),
    1,
    request."created_at",
    request."updated_at"
FROM "agent_action_requests" AS request;

UPDATE "agent_action_requests"
SET "batch_id" = "id";

ALTER TABLE "agent_action_requests"
    ALTER COLUMN "batch_id" SET NOT NULL;

-- 실제 이실장 바로 재광고 흐름에 맞춘 안정 단계 키로 교체한다.
-- 재광고 버튼을 누른 뒤 팝업 안에서 노출종료에 동의하는 순서다.
-- 4/5 위치를 맞바꾸는 동안 request+position unique index와 충돌하지 않도록
-- 두 행을 임시 음수 위치로 먼저 옮긴다.
UPDATE "agent_action_execution_steps"
SET "position" = -"position"
WHERE "step_key" IN ('exposure_end', 'republish');

UPDATE "agent_action_execution_steps"
SET "position" = CASE "step_key"
    WHEN 'exposure_end' THEN 5
    WHEN 'republish' THEN 4
    ELSE "position"
END,
"step_key" = CASE "step_key"
    WHEN 'exposure_end' THEN 'exposure_end_consent'
    WHEN 'republish' THEN 'republish_start'
    WHEN 'ad_registration' THEN 'verification_prepare'
    WHEN 'payment_send' THEN 'save_send'
    ELSE "step_key"
END;

CREATE INDEX "agent_action_batches_office_created_idx"
    ON "agent_action_batches"("office_id", "created_at");

CREATE INDEX "agent_action_batches_office_control_updated_idx"
    ON "agent_action_batches"("office_id", "control_status", "updated_at");

CREATE INDEX "agent_action_requests_office_batch_created_idx"
    ON "agent_action_requests"("office_id", "batch_id", "created_at");

ALTER TABLE "agent_action_batches"
    ADD CONSTRAINT "agent_action_batches_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_action_batches"
    ADD CONSTRAINT "agent_action_batches_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_action_requests"
    ADD CONSTRAINT "agent_action_requests_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "agent_action_batches"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
