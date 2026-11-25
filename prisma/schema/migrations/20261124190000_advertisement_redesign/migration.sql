-- 광고 관리 스키마 전면 개편:
-- 1) 다중 CP 계정(office_cp_accounts) 도입 — account_key = CP 로그인 ID, 사무소 공용, 비밀번호 미저장
-- 2) listing_advertisements.source 폐지 + cp_account_id + manual_edited_at 도입, 계정 포함 부분 유일 인덱스 재정의
-- 3) listing_advertisement_histories 이력 칸 확장(floor_exposure, external_ad_id) 및 누락된 CHECK 제약 복구
-- 4) 스냅샷 세션의 계정 분리 및 미연결(listing_id IS NULL) resolved 항목 허용
-- 5) advertisement_change_requests 통합(publish 포함 · 광고당 1요청 · 다중 필드 · 자체 상태 · 묶음 Task N:1)

-- ── 1) office_cp_accounts ──────────────────────────────────────────────────
CREATE TABLE "office_cp_accounts" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "account_key" TEXT NOT NULL,
    "account_name" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "office_cp_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "office_cp_accounts_account_key_check"
      CHECK (NULLIF(BTRIM("account_key"), '') IS NOT NULL),
    CONSTRAINT "office_cp_accounts_channel_check"
      CHECK (NULLIF(BTRIM("channel"), '') IS NOT NULL)
);

CREATE UNIQUE INDEX "office_cp_accounts_office_id_channel_account_key_key"
  ON "office_cp_accounts"("office_id", "channel", "account_key");
CREATE INDEX "office_cp_accounts_office_id_channel_is_active_idx"
  ON "office_cp_accounts"("office_id", "channel", "is_active");

ALTER TABLE "office_cp_accounts"
  ADD CONSTRAINT "office_cp_accounts_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 2) listing_advertisements ──────────────────────────────────────────────
DROP INDEX IF EXISTS "listing_advertisements_one_active_per_listing_channel";
DROP INDEX IF EXISTS "listing_advertisements_listing_channel_key";
DROP INDEX IF EXISTS "listing_advertisements_property_channel_trade_key";
DROP INDEX IF EXISTS "listing_advertisements_active_external_ad_id_key";

ALTER TABLE "listing_advertisements"
  DROP COLUMN IF EXISTS "source",
  ADD COLUMN "cp_account_id" UUID,
  ADD COLUMN "manual_edited_at" TIMESTAMP(3);

CREATE INDEX "listing_advertisements_office_id_cp_account_id_idx"
  ON "listing_advertisements"("office_id", "cp_account_id");

ALTER TABLE "listing_advertisements"
  ADD CONSTRAINT "listing_advertisements_cp_account_id_fkey"
  FOREIGN KEY ("cp_account_id") REFERENCES "office_cp_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 같은 매물·같은 채널이라도 CP 계정이 다르면 각자 게재할 수 있다.
CREATE UNIQUE INDEX "listing_advertisements_listing_channel_account_key"
  ON "listing_advertisements" ("office_id", "listing_id", "channel", COALESCE("cp_account_id", '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE "listing_id" IS NOT NULL;

CREATE UNIQUE INDEX "listing_advertisements_property_channel_trade_account_key"
  ON "listing_advertisements" ("office_id", "property_id", "channel", "transaction_type", COALESCE("cp_account_id", '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE "listing_id" IS NULL AND "property_id" IS NOT NULL;

CREATE UNIQUE INDEX "listing_advertisements_active_external_ad_id_key"
  ON "listing_advertisements"("office_id", "channel", COALESCE("cp_account_id", '00000000-0000-0000-0000-000000000000'::uuid), "external_ad_id")
  WHERE "status" = 'active' AND "external_ad_id" IS NOT NULL;

-- ── 3) listing_advertisement_histories ─────────────────────────────────────
ALTER TABLE "listing_advertisement_histories"
  ADD COLUMN "external_ad_id" TEXT,
  ADD COLUMN "floor_exposure" TEXT;

ALTER TABLE "listing_advertisement_histories"
  ADD CONSTRAINT "listing_advertisement_histories_source_check"
    CHECK ("source" IN ('cp_sync', 'manual', 'migration')),
  ADD CONSTRAINT "listing_advertisement_histories_status_check"
    CHECK ("status" IN ('active', 'ended')),
  ADD CONSTRAINT "listing_advertisement_histories_price_check"
    CHECK (
      ("advertised_price" IS NULL OR "advertised_price" >= 0)
      AND ("advertised_deposit" IS NULL OR "advertised_deposit" >= 0)
      AND ("advertised_monthly_rent" IS NULL OR "advertised_monthly_rent" >= 0)
    ),
  ADD CONSTRAINT "listing_advertisement_histories_floor_exposure_check"
    CHECK ("floor_exposure" IS NULL OR "floor_exposure" IN ('exact', 'band'));

-- ── 4) listing_advertisement_snapshot_sessions & items ─────────────────────
DROP INDEX IF EXISTS "listing_advertisement_snapshot_sessions_one_active_per_channel";
DROP INDEX IF EXISTS "listing_ad_snapshot_session_identity_key";

ALTER TABLE "listing_advertisement_snapshot_sessions"
  ADD COLUMN "cp_account_id" UUID;

CREATE INDEX "listing_ad_snapshot_session_account_status_idx"
  ON "listing_advertisement_snapshot_sessions"("office_id", "channel", "cp_account_id", "status");

CREATE UNIQUE INDEX "listing_ad_snapshot_session_identity_key"
  ON "listing_advertisement_snapshot_sessions"("office_id", "channel", COALESCE("cp_account_id", '00000000-0000-0000-0000-000000000000'::uuid), "manifest_hash");

CREATE UNIQUE INDEX "listing_advertisement_snapshot_sessions_one_active_per_account"
  ON "listing_advertisement_snapshot_sessions"("office_id", "channel", COALESCE("cp_account_id", '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE "status" = 'processing';

ALTER TABLE "listing_advertisement_snapshot_sessions"
  ADD CONSTRAINT "listing_advertisement_snapshot_sessions_cp_account_id_fkey"
  FOREIGN KEY ("cp_account_id") REFERENCES "office_cp_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 미연결 광고(listing_id IS NULL)도 resolved로 정상 제출될 수 있어야 한다.
ALTER TABLE "listing_advertisement_snapshot_items"
  DROP CONSTRAINT IF EXISTS "listing_ad_snapshot_items_outcome_check";

ALTER TABLE "listing_advertisement_snapshot_items"
  ADD CONSTRAINT "listing_ad_snapshot_items_outcome_check"
  CHECK (
    (
      "status" = 'resolved'
      AND "resolution" IS NOT NULL
      AND "error" IS NULL
    )
    OR (
      "status" = 'failed'
      AND "listing_id" IS NULL
      AND "property_id" IS NULL
      AND "site_id" IS NULL
      AND "resolution" IS NULL
      AND NULLIF(BTRIM("error"), '') IS NOT NULL
    )
  );

-- ── 5) advertisement_change_requests ───────────────────────────────────────
DROP INDEX IF EXISTS "advertisement_change_requests_task_id_key";
ALTER TABLE "advertisement_change_requests"
  DROP CONSTRAINT IF EXISTS "advertisement_change_requests_kind_check",
  DROP CONSTRAINT IF EXISTS "advertisement_change_requests_task_id_fkey";

ALTER TABLE "advertisement_change_requests"
  ALTER COLUMN "advertisement_id" DROP NOT NULL,
  ALTER COLUMN "task_id" DROP NOT NULL,
  ADD COLUMN "listing_id" UUID,
  ADD COLUMN "channel" TEXT,
  ADD COLUMN "cp_account_id" UUID,
  ADD COLUMN "action" TEXT,
  ADD COLUMN "base_snapshot" JSONB,
  ADD COLUMN "target_value" JSONB,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'requested',
  ADD COLUMN "failure_reason" TEXT,
  ADD COLUMN "memo" TEXT,
  ADD COLUMN "due_date" TIMESTAMP(3),
  ADD COLUMN "assigned_to_id" UUID,
  ADD COLUMN "executed_at" TIMESTAMP(3),
  ADD COLUMN "verified_at" TIMESTAMP(3),
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "advertisement_change_requests" r
SET
  "channel" = COALESCE(a."channel", 'esiljang'),
  "listing_id" = a."listing_id",
  "cp_account_id" = a."cp_account_id",
  "action" = CASE WHEN r."kind" IN ('price', 'floor_exposure') THEN 'update' ELSE r."kind" END,
  "base_snapshot" = r."from_value",
  "target_value" = r."to_value",
  "memo" = t."content",
  "due_date" = t."due_date",
  "assigned_to_id" = t."assigned_to_id",
  "status" = CASE
    WHEN t."status" = 'completed' THEN 'verified'
    WHEN t."status" = 'cancelled' THEN 'cancelled'
    WHEN t."status" = 'in_progress' THEN 'in_progress'
    ELSE 'requested'
  END,
  "verified_at" = CASE WHEN t."status" = 'completed' THEN t."updated_at" ELSE NULL END,
  "updated_at" = COALESCE(t."updated_at", r."created_at")
FROM "listing_advertisements" a, "tasks" t
WHERE r."advertisement_id" = a."id" AND r."task_id" = t."id";

-- 혹시 위 조인에 걸리지 않은 고아 행 방어 백필
UPDATE "advertisement_change_requests"
SET
  "channel" = COALESCE("channel", 'esiljang'),
  "action" = COALESCE("action", CASE WHEN "kind" IN ('price', 'floor_exposure') THEN 'update' ELSE COALESCE("kind", 'update') END),
  "base_snapshot" = COALESCE("base_snapshot", "from_value"),
  "target_value" = COALESCE("target_value", "to_value")
WHERE "channel" IS NULL OR "action" IS NULL;

ALTER TABLE "advertisement_change_requests"
  ALTER COLUMN "channel" SET NOT NULL,
  ALTER COLUMN "action" SET NOT NULL,
  DROP COLUMN "kind",
  DROP COLUMN "from_value",
  DROP COLUMN "to_value";

ALTER TABLE "advertisement_change_requests"
  ADD CONSTRAINT "advertisement_change_requests_action_check"
    CHECK ("action" IN ('publish', 'update', 'readvertise', 'takedown')),
  ADD CONSTRAINT "advertisement_change_requests_status_check"
    CHECK ("status" IN ('requested', 'in_progress', 'executed', 'verified', 'failed', 'cancelled')),
  ADD CONSTRAINT "advertisement_change_requests_target_ref_check"
    CHECK (
      ("action" = 'publish' AND "listing_id" IS NOT NULL)
      OR ("action" <> 'publish' AND "advertisement_id" IS NOT NULL)
    );

CREATE INDEX "advertisement_change_requests_office_id_status_idx"
  ON "advertisement_change_requests"("office_id", "status");
CREATE INDEX "advertisement_change_requests_office_id_listing_id_idx"
  ON "advertisement_change_requests"("office_id", "listing_id");
CREATE INDEX "advertisement_change_requests_task_id_idx"
  ON "advertisement_change_requests"("task_id");
CREATE INDEX "advertisement_change_requests_office_id_cp_account_id_idx"
  ON "advertisement_change_requests"("office_id", "cp_account_id");

CREATE UNIQUE INDEX "advertisement_change_requests_open_ad_key"
  ON "advertisement_change_requests"("office_id", "advertisement_id")
  WHERE "advertisement_id" IS NOT NULL AND "status" IN ('requested', 'in_progress', 'executed');

CREATE UNIQUE INDEX "advertisement_change_requests_open_publish_key"
  ON "advertisement_change_requests"("office_id", "listing_id", "channel", COALESCE("cp_account_id", '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE "action" = 'publish' AND "listing_id" IS NOT NULL AND "status" IN ('requested', 'in_progress', 'executed');

ALTER TABLE "advertisement_change_requests"
  ADD CONSTRAINT "advertisement_change_requests_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "advertisement_change_requests_cp_account_id_fkey"
    FOREIGN KEY ("cp_account_id") REFERENCES "office_cp_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "advertisement_change_requests_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "advertisement_change_requests_assigned_to_id_fkey"
    FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
