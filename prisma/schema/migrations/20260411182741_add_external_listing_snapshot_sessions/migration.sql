-- CreateTable
CREATE TABLE "external_listing_snapshot_sessions" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "transaction_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_by_id" UUID NOT NULL,
    "completed_at" TIMESTAMP(3),
    "completed_by_id" UUID,
    "stale_listings_marked" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_listing_snapshot_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_listing_snapshot_sessions_office_id_site_id_transa_idx" ON "external_listing_snapshot_sessions"("office_id", "site_id", "transaction_type", "status");

-- CreateIndex
CREATE INDEX "external_listing_snapshot_sessions_office_id_started_at_idx" ON "external_listing_snapshot_sessions"("office_id", "started_at");

-- AddForeignKey
ALTER TABLE "external_listing_snapshot_sessions" ADD CONSTRAINT "external_listing_snapshot_sessions_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_listing_snapshot_sessions" ADD CONSTRAINT "external_listing_snapshot_sessions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_listing_snapshot_sessions" ADD CONSTRAINT "external_listing_snapshot_sessions_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_listing_snapshot_sessions" ADD CONSTRAINT "external_listing_snapshot_sessions_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique index: 같은 (office, site, transactionType) 스코프에 active 세션이
-- 하나만 존재하도록 DB 레벨에서 강제. Prisma 스키마로 표현 불가하므로 수동 SQL.
CREATE UNIQUE INDEX "external_listing_snapshot_sessions_active_unique"
  ON "external_listing_snapshot_sessions" ("office_id", "site_id", "transaction_type")
  WHERE "status" = 'active';

