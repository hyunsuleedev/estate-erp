-- 직원 정산: 입금 건별 기록, 월 정산 확정, 직원 조건, 거래 담당 배분.
-- 금액은 원 단위다 (부가세 10%와 3.3% 공제를 만원으로는 담을 수 없다).

-- 1. 직원 조건과 사무소의 정산 시점
ALTER TABLE "users"
  ADD COLUMN "employment_type" TEXT NOT NULL DEFAULT 'freelancer',
  ADD COLUMN "withhold_tax" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users"
  ADD CONSTRAINT "users_employment_type_check" CHECK ("employment_type" IN ('freelancer', 'employee'));

ALTER TABLE "offices" ADD COLUMN "settlement_timing" TEXT NOT NULL DEFAULT 'closed';
ALTER TABLE "offices"
  ADD CONSTRAINT "offices_settlement_timing_check" CHECK ("settlement_timing" IN ('closed', 'received'));

-- 2. 거래 담당 배분
ALTER TABLE "deal_participants" ADD COLUMN "share_percent" INTEGER;
ALTER TABLE "deal_participants"
  ADD CONSTRAINT "deal_participants_share_percent_check" CHECK ("share_percent" IS NULL OR ("share_percent" BETWEEN 0 AND 100));

-- 3. 월 정산
CREATE TABLE "settlements" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "month" VARCHAR(7) NOT NULL,
  "timing" TEXT NOT NULL,
  "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmed_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "settlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "settlements_month_check" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "settlements_timing_check" CHECK ("timing" IN ('closed', 'received')),
  CONSTRAINT "settlements_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "settlements_office_id_month_key" ON "settlements"("office_id", "month");
-- 같은 사무소 안에서만 이어지게 하는 조합 FK의 대상
CREATE UNIQUE INDEX "settlements_office_id_id_key" ON "settlements"("office_id", "id");

CREATE TABLE "settlement_lines" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "settlement_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "employment_type" TEXT NOT NULL,
  "withhold_tax" BOOLEAN NOT NULL,
  "target_won" INTEGER NOT NULL,
  "share_won" INTEGER NOT NULL,
  "base_won" INTEGER NOT NULL DEFAULT 0,
  "adjust_won" INTEGER NOT NULL DEFAULT 0,
  "carry_in_won" INTEGER NOT NULL DEFAULT 0,
  "withholding_won" INTEGER NOT NULL DEFAULT 0,
  "net_won" INTEGER NOT NULL,
  "carry_out_won" INTEGER NOT NULL DEFAULT 0,
  "detail" JSONB NOT NULL,
  "paid_at" TIMESTAMP(3),
  "paid_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "settlement_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "settlement_lines_employment_type_check" CHECK ("employment_type" IN ('freelancer', 'employee')),
  CONSTRAINT "settlement_lines_amounts_check" CHECK (
    "base_won" >= 0 AND "adjust_won" <= 0 AND "carry_in_won" >= 0 AND "withholding_won" >= 0 AND "net_won" >= 0 AND "carry_out_won" >= 0
  ),
  CONSTRAINT "settlement_lines_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "settlement_lines_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "settlement_lines_office_settlement_fkey" FOREIGN KEY ("office_id", "settlement_id") REFERENCES "settlements"("office_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "settlement_lines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "settlement_lines_settlement_id_user_id_key" ON "settlement_lines"("settlement_id", "user_id");
CREATE INDEX "settlement_lines_office_id_user_id_idx" ON "settlement_lines"("office_id", "user_id");

-- 4. 입금 건별 기록
CREATE UNIQUE INDEX "commission_payments_office_id_id_key" ON "commission_payments"("office_id", "id");

CREATE TABLE "commission_receipts" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'receipt',
  "received_at" TIMESTAMP(3) NOT NULL,
  "amount_won" INTEGER NOT NULL,
  "supply_won" INTEGER NOT NULL,
  "method" TEXT,
  "memo" TEXT,
  "created_by_id" UUID,
  "voided_at" TIMESTAMP(3),
  "voided_by_id" UUID,
  "void_reason" TEXT,
  "settlement_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commission_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_receipts_kind_check" CHECK (
    ("kind" = 'receipt' AND "amount_won" > 0 AND "supply_won" > 0) OR ("kind" = 'refund' AND "amount_won" < 0 AND "supply_won" < 0)
  ),
  -- 정산에 들어간 줄은 취소할 수 없다
  CONSTRAINT "commission_receipts_void_check" CHECK ("voided_at" IS NULL OR "settlement_id" IS NULL),
  CONSTRAINT "commission_receipts_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commission_receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "commission_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commission_receipts_office_payment_fkey" FOREIGN KEY ("office_id", "payment_id") REFERENCES "commission_payments"("office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commission_receipts_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "commission_receipts_office_id_received_at_idx" ON "commission_receipts"("office_id", "received_at");
CREATE INDEX "commission_receipts_payment_id_idx" ON "commission_receipts"("payment_id");
CREATE INDEX "commission_receipts_office_id_settlement_id_idx" ON "commission_receipts"("office_id", "settlement_id");

-- 5. 이미 수금으로 적혀 있던 금액을 입금 기록 한 줄로 옮긴다.
--    지금까지는 청구마다 누적액(만원)과 마지막 입금일만 있었으므로 한 줄로만 옮길 수 있다.
--    만원 금액은 부가세를 뺀 금액으로 보고, 실제 오간 돈은 10%를 더해 적는다.
INSERT INTO "commission_receipts" ("id", "office_id", "payment_id", "kind", "received_at", "amount_won", "supply_won", "method", "memo", "created_at", "updated_at")
SELECT gen_random_uuid(), p."office_id", p."id", 'receipt', COALESCE(p."paid_at", p."updated_at"),
       p."actual_amount" * 11000, p."actual_amount" * 10000, p."method", '예전 수금 기록에서 옮김', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "commission_payments" p
WHERE p."actual_amount" IS NOT NULL AND p."actual_amount" > 0 AND p."actual_amount" <= 195000;
