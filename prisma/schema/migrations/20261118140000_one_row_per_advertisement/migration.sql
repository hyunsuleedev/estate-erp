-- 광고 한 줄 = 한 광고 (이전: 게재 한 회차)
--
-- 1. 같은 광고(열쇠가 같은 줄)를 한 줄로 합친다.
--      매물이 있으면          사무소 + 매물 + 채널
--      매물 없이 호실까지면   사무소 + 관리 공간 + 채널 + 거래유형
-- 2. 네이버 비교: 묶음 표를 없애고 비교 광고가 내 광고를 직접 가리킨다. 읽을 때마다의 요약을 쌓는 표를 더한다.
-- 3. 가격 이력을 광고 이력으로 넓힌다 (게재 상태 · 네이버 번호).
-- 4. 열쇠에 부분 유일 인덱스를 건다.
--
-- 표 이름이 바뀌는 것은 새 표를 만들어 옮기고 옛 표를 지운다 (제약 · 인덱스 이름이 새 표 이름을 따르게).

-- ── 1. 같은 광고 합치기 ─────────────────────────────────────────────────────
-- 남기는 줄: 게재 중인 것 → 가장 최근에 본 것 → 가장 나중에 만든 것.
CREATE TEMP TABLE _advertisement_merge ON COMMIT DROP AS
WITH keyed AS (
  SELECT
    id,
    office_id,
    CASE
      WHEN listing_id IS NOT NULL THEN 'L:' || listing_id || ':' || channel
      WHEN property_id IS NOT NULL AND transaction_type IS NOT NULL
        THEN 'P:' || property_id || ':' || channel || ':' || transaction_type
    END AS merge_key,
    status,
    last_seen_at,
    created_at
  FROM listing_advertisements
),
ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY office_id, merge_key
      ORDER BY (status = 'active') DESC, last_seen_at DESC, created_at DESC, id
    ) AS keep_id
  FROM keyed
  WHERE merge_key IS NOT NULL
)
SELECT id AS drop_id, keep_id FROM ranked WHERE id <> keep_id;

-- 지나간 가격과 걸려 있던 요청은 남기는 줄로 옮긴다
UPDATE listing_advertisement_price_histories h
SET listing_advertisement_id = m.keep_id
FROM _advertisement_merge m
WHERE h.listing_advertisement_id = m.drop_id;

UPDATE advertisement_change_requests r
SET advertisement_id = m.keep_id
FROM _advertisement_merge m
WHERE r.advertisement_id = m.drop_id;

-- 처음 본 시각은 합친 줄들 중 가장 이른 것
UPDATE listing_advertisements a
SET first_seen_at = merged.first_seen_at
FROM (
  SELECT m.keep_id, min(d.first_seen_at) AS first_seen_at
  FROM _advertisement_merge m
  JOIN listing_advertisements d ON d.id = m.drop_id
  GROUP BY m.keep_id
) merged
WHERE a.id = merged.keep_id AND merged.first_seen_at < a.first_seen_at;

-- 합쳐진 줄을 지운다 (그 줄의 네이버 비교는 함께 지워진다 — 남기는 줄의 비교가 최신이다)
DELETE FROM listing_advertisements a
USING _advertisement_merge m
WHERE a.id = m.drop_id;

-- ── 2 · 3. 새 표 ───────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "advertisement_comparisons" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "advertisement_id" UUID NOT NULL,
    "article_no" TEXT NOT NULL,
    "source_url" TEXT,
    "is_mine" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "article_name" TEXT,
    "realtor_name" TEXT,
    "realtor_id" TEXT,
    "representative_tel_no" TEXT,
    "price" INTEGER,
    "deposit" INTEGER,
    "monthly_rent" INTEGER,
    "ranking" INTEGER,
    "same_addr_cnt" INTEGER,
    "article_confirm_ymd" TEXT,
    "floor_info" TEXT,
    "floor_exposure_mode" TEXT NOT NULL DEFAULT 'unknown',
    "verification_type_code" TEXT,
    "seango" BOOLEAN NOT NULL DEFAULT false,
    "epju" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advertisement_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advertisement_comparison_records" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "advertisement_id" UUID NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "own_visible" BOOLEAN NOT NULL,
    "own_ranking" INTEGER,
    "total_count" INTEGER NOT NULL,
    "own_price" INTEGER,
    "own_deposit" INTEGER,
    "own_monthly_rent" INTEGER,
    "lowest_competitor_amount" INTEGER,
    "lower_priced_count" INTEGER NOT NULL DEFAULT 0,
    "own_floor_exposure" TEXT NOT NULL DEFAULT 'unknown',
    "exact_floor_competitor_count" INTEGER NOT NULL DEFAULT 0,
    "signal" TEXT NOT NULL,
    "changes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advertisement_comparison_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_advertisement_histories" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "listing_advertisement_id" UUID NOT NULL,
    "snapshot_session_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'active',
    "naver_article_no" TEXT,
    "advertised_price" INTEGER,
    "advertised_deposit" INTEGER,
    "advertised_monthly_rent" INTEGER,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'cp_sync',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_advertisement_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "advertisement_comparisons_office_id_is_mine_idx" ON "advertisement_comparisons"("office_id", "is_mine");

-- CreateIndex
CREATE INDEX "advertisement_comparisons_office_id_is_active_idx" ON "advertisement_comparisons"("office_id", "is_active");

-- CreateIndex
CREATE INDEX "advertisement_comparisons_office_id_last_seen_at_idx" ON "advertisement_comparisons"("office_id", "last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "advertisement_comparisons_advertisement_id_article_no_key" ON "advertisement_comparisons"("advertisement_id", "article_no");

-- CreateIndex
CREATE INDEX "advertisement_comparison_records_advertisement_id_observed__idx" ON "advertisement_comparison_records"("advertisement_id", "observed_at");

-- CreateIndex
CREATE INDEX "advertisement_comparison_records_office_id_observed_at_idx" ON "advertisement_comparison_records"("office_id", "observed_at");

-- CreateIndex
CREATE INDEX "listing_advertisement_histories_office_id_observed_at_idx" ON "listing_advertisement_histories"("office_id", "observed_at");

-- CreateIndex
CREATE INDEX "listing_advertisement_histories_listing_advertisement_id_ob_idx" ON "listing_advertisement_histories"("listing_advertisement_id", "observed_at");

-- CreateIndex
CREATE INDEX "listing_advertisement_histories_snapshot_session_id_idx" ON "listing_advertisement_histories"("snapshot_session_id");

-- AddForeignKey
ALTER TABLE "advertisement_comparisons" ADD CONSTRAINT "advertisement_comparisons_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advertisement_comparisons" ADD CONSTRAINT "advertisement_comparisons_advertisement_id_fkey" FOREIGN KEY ("advertisement_id") REFERENCES "listing_advertisements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advertisement_comparison_records" ADD CONSTRAINT "advertisement_comparison_records_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advertisement_comparison_records" ADD CONSTRAINT "advertisement_comparison_records_advertisement_id_fkey" FOREIGN KEY ("advertisement_id") REFERENCES "listing_advertisements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_advertisement_histories" ADD CONSTRAINT "listing_advertisement_histories_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_advertisement_histories" ADD CONSTRAINT "listing_advertisement_histories_listing_advertisement_id_fkey" FOREIGN KEY ("listing_advertisement_id") REFERENCES "listing_advertisements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_advertisement_histories" ADD CONSTRAINT "listing_advertisement_histories_snapshot_session_id_fkey" FOREIGN KEY ("snapshot_session_id") REFERENCES "listing_advertisement_snapshot_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 옮기기 ─────────────────────────────────────────────────────────────────
-- 비교 광고: 묶음을 거치지 않고 내 광고에 바로 붙인다. is_main은 옮기지 않는다
-- (article_no가 내 광고의 naver_article_no와 같은 줄이 그것이다).
INSERT INTO advertisement_comparisons (
  id, office_id, advertisement_id, article_no, source_url, is_mine, is_active,
  article_name, realtor_name, realtor_id, representative_tel_no,
  price, deposit, monthly_rent, ranking, same_addr_cnt, article_confirm_ymd,
  floor_info, floor_exposure_mode, verification_type_code, seango, epju, raw,
  first_seen_at, last_seen_at, created_at, updated_at
)
SELECT
  o.id, o.office_id, g.listing_advertisement_id, o.article_no, o.source_url, o.is_mine, o.is_active,
  o.article_name, o.realtor_name, o.realtor_id, o.representative_tel_no,
  o.price, o.deposit, o.monthly_rent, o.ranking, o.same_addr_cnt, o.article_confirm_ymd,
  o.floor_info, o.floor_exposure_mode, o.verification_type_code, o.seango, o.epju, o.raw,
  o.first_seen_at, o.last_seen_at, o.created_at, o.updated_at
FROM office_advertisements o
JOIN office_advertisement_groups g ON g.id = o.group_id;

-- 광고 이력: 지금까지의 가격 이력은 모두 게재 중이던 때의 것이다.
-- 그때의 네이버 번호는 알 수 없어 비워 둔다 (지금 번호를 채우면 재광고가 없었던 것처럼 보인다).
INSERT INTO listing_advertisement_histories (
  id, office_id, listing_advertisement_id, snapshot_session_id, status, naver_article_no,
  advertised_price, advertised_deposit, advertised_monthly_rent, observed_at, source, created_at
)
SELECT
  id, office_id, listing_advertisement_id, snapshot_session_id, 'active', NULL,
  advertised_price, advertised_deposit, advertised_monthly_rent, observed_at, source, created_at
FROM listing_advertisement_price_histories;

-- 이미 종료된 광고는 종료된 때를 한 줄 남긴다
INSERT INTO listing_advertisement_histories (
  id, office_id, listing_advertisement_id, status, naver_article_no,
  advertised_price, advertised_deposit, advertised_monthly_rent, observed_at, source
)
SELECT
  gen_random_uuid(), office_id, id, 'ended', naver_article_no,
  advertised_price, advertised_deposit, advertised_monthly_rent,
  COALESCE(ended_at, last_seen_at), 'migration'
FROM listing_advertisements
WHERE status = 'ended';

DROP TABLE "office_advertisements" CASCADE;
DROP TABLE "office_advertisement_groups";
DROP TABLE "listing_advertisement_price_histories";

-- ── 4. 같은 광고는 한 줄 ────────────────────────────────────────────────────
-- 재광고 · 재게재는 새 줄이 아니라 같은 줄의 변화다. 서버가 열쇠로 같은 줄을 찾아 고친다.
CREATE UNIQUE INDEX "listing_advertisements_listing_channel_key"
  ON "listing_advertisements" ("office_id", "listing_id", "channel")
  WHERE "listing_id" IS NOT NULL;

CREATE UNIQUE INDEX "listing_advertisements_property_channel_trade_key"
  ON "listing_advertisements" ("office_id", "property_id", "channel", "transaction_type")
  WHERE "listing_id" IS NULL AND "property_id" IS NOT NULL;
