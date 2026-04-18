-- ============================================================
-- Deal / Contract / DealPayment 재설계
-- - Deal: price → agreedPrice (+ agreedDeposit/agreedMonthlyRent), stage 7단계,
--         취소 직교 플래그, transactionType 승격, matchId/externalListingId/specialTerms,
--         preContractCarriedOver, ourSide, stageChangedAt
-- - Contract: 실제 입금 필드 (contract_deposit/middle_payment/final_payment + _date/_paid) 제거,
--             계약서상 명목 금액 stated_deposit/stated_interim_payment/stated_balance + _date 추가
-- - DealPayment: 가계약/계약/중도/잔금/환불 row 단위 돈 흐름 추적 테이블 신규
-- ============================================================

-- 1) Deal: 새 컬럼 먼저 추가 (transactionType 은 nullable 로 일단 추가)
ALTER TABLE "deals"
  ADD COLUMN "agreed_price" INTEGER,
  ADD COLUMN "agreed_deposit" INTEGER,
  ADD COLUMN "agreed_monthly_rent" INTEGER,
  ADD COLUMN "agreed_move_in_date" TIMESTAMP(3),
  ADD COLUMN "special_terms" TEXT,
  ADD COLUMN "transaction_type" TEXT,
  ADD COLUMN "match_id" UUID,
  ADD COLUMN "external_listing_id" UUID,
  ADD COLUMN "stage_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancel_reason" TEXT,
  ADD COLUMN "cancelled_by" TEXT,
  ADD COLUMN "pre_contract_carried_over" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "our_side" TEXT;

-- 2) Deal 기존 데이터 이관
--    price -> agreed_price (transactionType='sale'/'jeonse' 대응)
--    listing 에서 transactionType 복사
UPDATE "deals" d
   SET "agreed_price" = d."price",
       "transaction_type" = COALESCE(l."transaction_type", 'sale')
  FROM "listings" l
 WHERE l."id" = d."listing_id";

-- listing 이 null 인 deal 은 transactionType 기본값 'sale'
UPDATE "deals" SET "transaction_type" = 'sale' WHERE "transaction_type" IS NULL;

-- 3) stage 값 변환: deposit -> preContract, contract -> contracted
UPDATE "deals" SET "stage" = 'preContract' WHERE "stage" = 'deposit';
UPDATE "deals" SET "stage" = 'contracted'  WHERE "stage" = 'contract';

-- 4) transaction_type NOT NULL 로 승격
ALTER TABLE "deals" ALTER COLUMN "transaction_type" SET NOT NULL;

-- 5) Deal.price 컬럼 제거, listing_id NULL 허용
ALTER TABLE "deals" DROP COLUMN "price";
ALTER TABLE "deals" DROP CONSTRAINT IF EXISTS "deals_listing_id_fkey";
ALTER TABLE "deals" ALTER COLUMN "listing_id" DROP NOT NULL;
ALTER TABLE "deals"
  ADD CONSTRAINT "deals_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "listings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Deal 인덱스/FK 추가
CREATE INDEX "deals_office_id_is_cancelled_stage_idx"
  ON "deals"("office_id", "is_cancelled", "stage");
CREATE INDEX "deals_listing_id_idx" ON "deals"("listing_id");
CREATE INDEX "deals_match_id_idx"   ON "deals"("match_id");

ALTER TABLE "deals"
  ADD CONSTRAINT "deals_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deals"
  ADD CONSTRAINT "deals_external_listing_id_fkey"
  FOREIGN KEY ("external_listing_id") REFERENCES "external_listings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 6) DealPayment 신규 테이블
-- ============================================================

CREATE TABLE "deal_payments" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "deal_id"   UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT 1,
  "scheduled_amount" INTEGER NOT NULL,
  "scheduled_date" TIMESTAMP(3),
  "paid_amount" INTEGER,
  "paid_at" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'pending',
  "method" TEXT,
  "account_info" TEXT,
  "payer_name" TEXT,
  "receipt_url" TEXT,
  "memo" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "deal_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deal_payments_deal_id_kind_sequence_key"
  ON "deal_payments"("deal_id", "kind", "sequence");
CREATE INDEX "deal_payments_office_id_status_scheduled_date_idx"
  ON "deal_payments"("office_id", "status", "scheduled_date");
CREATE INDEX "deal_payments_deal_id_kind_idx"
  ON "deal_payments"("deal_id", "kind");

ALTER TABLE "deal_payments"
  ADD CONSTRAINT "deal_payments_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON UPDATE CASCADE;

ALTER TABLE "deal_payments"
  ADD CONSTRAINT "deal_payments_deal_id_fkey"
  FOREIGN KEY ("deal_id") REFERENCES "deals"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 7) 기존 Contract 의 입금 데이터를 DealPayment 로 이관
INSERT INTO "deal_payments"
  ("id", "office_id", "deal_id", "kind", "sequence",
   "scheduled_amount", "scheduled_date", "paid_amount", "paid_at",
   "status", "created_at", "updated_at")
SELECT gen_random_uuid(), c."office_id", c."deal_id", 'contract', 1,
       c."contract_deposit",
       c."contract_deposit_date",
       CASE WHEN c."contract_deposit_paid" THEN c."contract_deposit" END,
       CASE WHEN c."contract_deposit_paid" THEN c."contract_deposit_date" END,
       CASE WHEN c."contract_deposit_paid" THEN 'paid' ELSE 'pending' END,
       NOW(), NOW()
  FROM "contracts" c
 WHERE c."contract_deposit" IS NOT NULL;

INSERT INTO "deal_payments"
  ("id", "office_id", "deal_id", "kind", "sequence",
   "scheduled_amount", "scheduled_date", "paid_amount", "paid_at",
   "status", "created_at", "updated_at")
SELECT gen_random_uuid(), c."office_id", c."deal_id", 'interim', 1,
       c."middle_payment",
       c."middle_payment_date",
       CASE WHEN c."middle_payment_paid" THEN c."middle_payment" END,
       CASE WHEN c."middle_payment_paid" THEN c."middle_payment_date" END,
       CASE WHEN c."middle_payment_paid" THEN 'paid' ELSE 'pending' END,
       NOW(), NOW()
  FROM "contracts" c
 WHERE c."middle_payment" IS NOT NULL;

INSERT INTO "deal_payments"
  ("id", "office_id", "deal_id", "kind", "sequence",
   "scheduled_amount", "scheduled_date", "paid_amount", "paid_at",
   "status", "created_at", "updated_at")
SELECT gen_random_uuid(), c."office_id", c."deal_id", 'balance', 1,
       c."final_payment",
       c."final_payment_date",
       CASE WHEN c."final_payment_paid" THEN c."final_payment" END,
       CASE WHEN c."final_payment_paid" THEN c."final_payment_date" END,
       CASE WHEN c."final_payment_paid" THEN 'paid' ELSE 'pending' END,
       NOW(), NOW()
  FROM "contracts" c
 WHERE c."final_payment" IS NOT NULL;

-- ============================================================
-- 8) Contract: stated_* 컬럼 추가 + 기존 contract_deposit/middle_payment/final_payment 을
--    stated 로 복사 후 삭제
-- ============================================================

ALTER TABLE "contracts"
  ADD COLUMN "stated_deposit" INTEGER,
  ADD COLUMN "stated_interim_payment" INTEGER,
  ADD COLUMN "stated_interim_date" TIMESTAMP(3),
  ADD COLUMN "stated_balance" INTEGER,
  ADD COLUMN "stated_balance_date" TIMESTAMP(3);

UPDATE "contracts"
   SET "stated_deposit"         = "contract_deposit",
       "stated_interim_payment" = "middle_payment",
       "stated_interim_date"    = "middle_payment_date",
       "stated_balance"         = "final_payment",
       "stated_balance_date"    = "final_payment_date";

ALTER TABLE "contracts"
  DROP COLUMN "contract_deposit",
  DROP COLUMN "contract_deposit_date",
  DROP COLUMN "contract_deposit_paid",
  DROP COLUMN "middle_payment",
  DROP COLUMN "middle_payment_date",
  DROP COLUMN "middle_payment_paid",
  DROP COLUMN "final_payment",
  DROP COLUMN "final_payment_date",
  DROP COLUMN "final_payment_paid";
