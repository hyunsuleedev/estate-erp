CREATE TABLE "listing_advertisement_snapshot_sessions" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "channel" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'active_advertisements',
  "status" TEXT NOT NULL DEFAULT 'processing',
  "observed_at" TIMESTAMP(3) NOT NULL,
  "expected_total" INTEGER,
  "manifest_hash" VARCHAR(64) NOT NULL,
  "file_sha256" VARCHAR(64),
  "active_filter" JSONB NOT NULL,
  "pagination_complete" BOOLEAN NOT NULL,
  "visited_pages" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "received_count" INTEGER NOT NULL DEFAULT 0,
  "resolved_count" INTEGER NOT NULL DEFAULT 0,
  "started_by_id" UUID NOT NULL,
  "completed_by_id" UUID,
  "completed_at" TIMESTAMP(3),
  "created_advertisements" INTEGER,
  "updated_advertisements" INTEGER,
  "stale_advertisements_marked" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "listing_advertisement_snapshot_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listing_advertisement_snapshot_sessions_status_check"
    CHECK ("status" IN ('processing', 'completed', 'cancelled')),
  CONSTRAINT "listing_advertisement_snapshot_sessions_scope_check"
    CHECK ("scope" = 'active_advertisements'),
  CONSTRAINT "listing_advertisement_snapshot_sessions_expected_total_check"
    CHECK ("expected_total" IS NULL OR "expected_total" >= 0),
  CONSTRAINT "listing_advertisement_snapshot_sessions_counts_check"
    CHECK (
      "received_count" >= 0
      AND "resolved_count" >= 0
      AND "resolved_count" <= "received_count"
      AND ("expected_total" IS NULL OR "received_count" <= "expected_total")
    ),
  CONSTRAINT "listing_advertisement_snapshot_sessions_pagination_check"
    CHECK ("pagination_complete" = TRUE),
  CONSTRAINT "listing_advertisement_snapshot_sessions_manifest_hash_check"
    CHECK ("manifest_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "listing_advertisement_snapshot_sessions_file_sha256_check"
    CHECK ("file_sha256" IS NULL OR "file_sha256" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "listing_advertisement_snapshot_items" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "external_ad_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "raw" JSONB NOT NULL,
  "item_hash" VARCHAR(64) NOT NULL,
  "listing_id" UUID,
  "resolution" JSONB,
  "error" TEXT,
  "submitted_by_id" UUID NOT NULL,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempt_count" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "listing_advertisement_snapshot_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listing_advertisement_snapshot_items_status_check"
    CHECK ("status" IN ('resolved', 'failed')),
  CONSTRAINT "listing_ad_snapshot_items_outcome_check"
    CHECK (
      (
        "status" = 'resolved'
        AND "listing_id" IS NOT NULL
        AND "resolution" IS NOT NULL
        AND "error" IS NULL
      )
      OR (
        "status" = 'failed'
        AND "listing_id" IS NULL
        AND "resolution" IS NULL
        AND NULLIF(BTRIM("error"), '') IS NOT NULL
      )
    ),
  CONSTRAINT "listing_advertisement_snapshot_items_attempt_count_check"
    CHECK ("attempt_count" >= 1),
  CONSTRAINT "listing_advertisement_snapshot_items_item_hash_check"
    CHECK ("item_hash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "listing_ad_snapshot_session_identity_key"
  ON "listing_advertisement_snapshot_sessions"("office_id", "channel", "manifest_hash");
CREATE UNIQUE INDEX "listing_advertisement_snapshot_sessions_one_active_per_channel"
  ON "listing_advertisement_snapshot_sessions"("office_id", "channel")
  WHERE "status" = 'processing';
CREATE INDEX "listing_ad_snapshot_session_channel_status_idx"
  ON "listing_advertisement_snapshot_sessions"("office_id", "channel", "status");
CREATE INDEX "listing_ad_snapshot_session_created_idx"
  ON "listing_advertisement_snapshot_sessions"("office_id", "created_at");

CREATE UNIQUE INDEX "listing_ad_snapshot_item_external_key"
  ON "listing_advertisement_snapshot_items"("session_id", "external_ad_id");
CREATE INDEX "listing_ad_snapshot_item_status_idx"
  ON "listing_advertisement_snapshot_items"("office_id", "session_id", "status");
CREATE INDEX "listing_advertisement_snapshot_items_office_id_listing_id_idx"
  ON "listing_advertisement_snapshot_items"("office_id", "listing_id");
CREATE INDEX "listing_advertisement_snapshot_items_session_id_created_at_idx"
  ON "listing_advertisement_snapshot_items"("session_id", "created_at");

-- CP 광고 ID는 같은 사무소·CP 안에서 한 원장 row만 가리킨다. NULL인 수동
-- 광고는 허용하기 위해 부분 유니크 인덱스로 둔다.
CREATE UNIQUE INDEX "listing_advertisements_office_channel_external_ad_id_key"
  ON "listing_advertisements"("office_id", "channel", "external_ad_id")
  WHERE "external_ad_id" IS NOT NULL;

ALTER TABLE "listing_advertisement_snapshot_sessions"
  ADD CONSTRAINT "listing_advertisement_snapshot_sessions_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "listing_advertisement_snapshot_sessions_started_by_id_fkey"
    FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "listing_advertisement_snapshot_sessions_completed_by_id_fkey"
    FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "listing_advertisement_snapshot_items"
  ADD CONSTRAINT "listing_advertisement_snapshot_items_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "listing_advertisement_snapshot_items_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "listing_advertisement_snapshot_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "listing_advertisement_snapshot_items_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "listing_advertisement_snapshot_items_submitted_by_id_fkey"
    FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
