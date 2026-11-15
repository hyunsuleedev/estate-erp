-- 중개 건을 모든 의뢰의 필수 상위 층에서, 사용자가 묶을 때만 생기는 선택 사항으로 바꾼다.
--
-- 1. 진행 계획(brokerage_case_steps) 추가: 사람이 정한 단계와 순서.
-- 2. 의뢰의 건 참조를 비울 수 있게 하고 건 안 순위(case_priority_rank)를 지운다.
-- 3. 서버가 자동으로 만든 건(의뢰 하나, 제목·메모 없음)은 풀고 지운다.
--    남는 건은 담긴 의뢰마다 단계를 하나씩 만들어 기존 순위를 순서로 옮긴다.
-- 4. 건 참여자와 의존 관계 표를 지운다. 당사자는 의뢰에서 읽는다.
-- 5. 거래에 구매 의뢰 칸을 추가하고, 매칭에서 전환된 거래는 채운다.

-- ─── 1. 진행 계획 ─────────────────────────────────────────────
CREATE TABLE "brokerage_case_steps" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "brokerage_case_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "listing_intake_id" UUID,
    "buyer_intake_id" UUID,
    "deal_id" UUID,
    "target_date" DATE,
    "memo" TEXT,
    "done_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brokerage_case_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "brokerage_case_steps_sort_order_check" CHECK ("sort_order" >= 1),
    CONSTRAINT "brokerage_case_steps_title_check" CHECK (btrim("title") <> ''),
    -- 한 단계는 매물 의뢰, 구매 의뢰, 거래 중 하나만 가리키거나 아무것도 가리키지 않는다.
    CONSTRAINT "brokerage_case_steps_one_target_check" CHECK (
        num_nonnulls("listing_intake_id", "buyer_intake_id", "deal_id") <= 1
    ),
    -- 완료 체크는 아무것도 가리키지 않는 단계에만 쓴다. 나머지는 의뢰·거래에서 읽는다.
    CONSTRAINT "brokerage_case_steps_manual_done_check" CHECK (
        "done_at" IS NULL
        OR num_nonnulls("listing_intake_id", "buyer_intake_id", "deal_id") = 0
    )
);

CREATE INDEX "brokerage_case_steps_office_id_brokerage_case_id_sort_order_idx"
    ON "brokerage_case_steps"("office_id", "brokerage_case_id", "sort_order");
CREATE INDEX "brokerage_case_steps_deal_id_idx" ON "brokerage_case_steps"("deal_id");
-- 한 건 안에서 같은 의뢰·거래를 두 단계로 넣지 못하게 한다.
CREATE UNIQUE INDEX "brokerage_case_steps_case_listing_intake_key"
    ON "brokerage_case_steps"("brokerage_case_id", "listing_intake_id")
    WHERE "listing_intake_id" IS NOT NULL;
CREATE UNIQUE INDEX "brokerage_case_steps_case_buyer_intake_key"
    ON "brokerage_case_steps"("brokerage_case_id", "buyer_intake_id")
    WHERE "buyer_intake_id" IS NOT NULL;
CREATE UNIQUE INDEX "brokerage_case_steps_case_deal_key"
    ON "brokerage_case_steps"("brokerage_case_id", "deal_id")
    WHERE "deal_id" IS NOT NULL;

-- ─── 2. 의뢰의 건 참조를 선택 사항으로 ────────────────────────
ALTER TABLE "buyer_intakes" ALTER COLUMN "brokerage_case_id" DROP NOT NULL;
ALTER TABLE "listing_intakes" ALTER COLUMN "brokerage_case_id" DROP NOT NULL;

-- ─── 3. 기존 건 옮기기 ────────────────────────────────────────
-- 서버가 자동으로 만든 건: 담긴 의뢰가 하나 이하이고 제목·메모가 없다.
CREATE TEMPORARY TABLE "_auto_brokerage_cases" ON COMMIT DROP AS
SELECT bc."id"
FROM "brokerage_cases" bc
WHERE COALESCE(btrim(bc."title"), '') = ''
  AND COALESCE(btrim(bc."memo"), '') = ''
  AND (
    (SELECT COUNT(*) FROM "listing_intakes" li WHERE li."brokerage_case_id" = bc."id")
    + (SELECT COUNT(*) FROM "buyer_intakes" bi WHERE bi."brokerage_case_id" = bc."id")
  ) <= 1;

UPDATE "listing_intakes" SET "brokerage_case_id" = NULL
WHERE "brokerage_case_id" IN (SELECT "id" FROM "_auto_brokerage_cases");
UPDATE "buyer_intakes" SET "brokerage_case_id" = NULL
WHERE "brokerage_case_id" IN (SELECT "id" FROM "_auto_brokerage_cases");

-- 남는 건: 담긴 의뢰마다 단계 하나. 순서는 기존 순위, 같은 순위면 접수 순.
INSERT INTO "brokerage_case_steps" (
    "id", "office_id", "brokerage_case_id", "sort_order", "title",
    "listing_intake_id", "buyer_intake_id", "updated_at"
)
SELECT
    gen_random_uuid(),
    ranked.office_id,
    ranked.case_id,
    ROW_NUMBER() OVER (
        PARTITION BY ranked.case_id
        ORDER BY ranked.case_rank, ranked.received_at, ranked.intake_id
    ),
    ranked.title,
    ranked.listing_intake_id,
    ranked.buyer_intake_id,
    CURRENT_TIMESTAMP
FROM (
    SELECT
        li."office_id" AS office_id,
        li."brokerage_case_id" AS case_id,
        li."case_priority_rank" AS case_rank,
        li."received_at" AS received_at,
        li."id" AS intake_id,
        CONCAT_WS(' ', s."name", u."name", '매물 의뢰') AS title,
        li."id" AS listing_intake_id,
        NULL::uuid AS buyer_intake_id
    FROM "listing_intakes" li
    JOIN "properties" p ON p."id" = li."property_id"
    JOIN "sites" s ON s."id" = p."site_id"
    LEFT JOIN "units" u ON u."id" = p."unit_id"
    WHERE li."brokerage_case_id" IS NOT NULL
    UNION ALL
    SELECT
        bi."office_id",
        bi."brokerage_case_id",
        bi."case_priority_rank",
        bi."received_at",
        bi."id",
        '구매 의뢰',
        NULL::uuid,
        bi."id"
    FROM "buyer_intakes" bi
    WHERE bi."brokerage_case_id" IS NOT NULL
) ranked;

-- ─── 4. 건 참여자·의존 관계·순위 삭제 ─────────────────────────
DROP TABLE "brokerage_case_dependencies";
DROP TABLE "brokerage_case_participants";

DELETE FROM "brokerage_cases"
WHERE "id" IN (SELECT "id" FROM "_auto_brokerage_cases");

DROP INDEX "buyer_intakes_office_id_case_id_lifecycle_priority_idx";
DROP INDEX "listing_intakes_office_id_case_id_lifecycle_priority_idx";
ALTER TABLE "buyer_intakes" DROP COLUMN "case_priority_rank";
ALTER TABLE "listing_intakes" DROP COLUMN "case_priority_rank";

-- ─── 5. 거래의 구매 의뢰 ──────────────────────────────────────
ALTER TABLE "deals" ADD COLUMN "buyer_intake_id" UUID;
CREATE INDEX "deals_office_id_buyer_intake_id_idx" ON "deals"("office_id", "buyer_intake_id");

UPDATE "deals" d
SET "buyer_intake_id" = br."buyer_intake_id"
FROM "matches" m
JOIN "buyer_requirements" br ON br."id" = m."buyer_req_id"
WHERE d."match_id" = m."id"
  AND br."office_id" = d."office_id";

-- ─── 외래 키 ──────────────────────────────────────────────────
ALTER TABLE "brokerage_case_steps"
  ADD CONSTRAINT "brokerage_case_steps_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "brokerage_case_steps_office_id_brokerage_case_id_fkey"
    FOREIGN KEY ("office_id", "brokerage_case_id")
    REFERENCES "brokerage_cases"("office_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  -- 같은 건에 담긴 의뢰만 가리킬 수 있다.
  ADD CONSTRAINT "brokerage_case_steps_office_id_brokerage_case_id_listing_i_fkey"
    FOREIGN KEY ("office_id", "brokerage_case_id", "listing_intake_id")
    REFERENCES "listing_intakes"("office_id", "brokerage_case_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "brokerage_case_steps_office_id_brokerage_case_id_buyer_int_fkey"
    FOREIGN KEY ("office_id", "brokerage_case_id", "buyer_intake_id")
    REFERENCES "buyer_intakes"("office_id", "brokerage_case_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "brokerage_case_steps_deal_id_fkey"
    FOREIGN KEY ("deal_id") REFERENCES "deals"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deals"
  ADD CONSTRAINT "deals_office_id_buyer_intake_id_fkey"
    FOREIGN KEY ("office_id", "buyer_intake_id")
    REFERENCES "buyer_intakes"("office_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
