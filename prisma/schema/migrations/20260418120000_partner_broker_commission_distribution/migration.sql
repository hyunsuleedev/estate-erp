-- ============================================================
-- PartnerBroker + Commission Distribution/Adjustment
-- ============================================================
-- Deal 의 공동중개 String 필드 제거하고 PartnerBroker FK 로 대체.
-- CommissionPayment.side 를 clientSide (seller/buyer 만) 로 의미 고정,
-- 파트너 분배는 CommissionDistribution 로 분리.
-- 기존 Insights 테이블, Proposal action_type/payload 컬럼, Office.code 제거
-- (이전 refactor 에서 schema 상 제거됐지만 DB drift 남아있음).

-- 이전 수동 deal_payments migration 이 office_id FK 를 ON DELETE 없이 생성했고
-- Prisma 는 RESTRICT 를 요구하므로 drop 후 재생성.
ALTER TABLE "deal_payments" DROP CONSTRAINT "deal_payments_office_id_fkey";
ALTER TABLE "insights" DROP CONSTRAINT "insights_office_id_fkey";

-- offices.code 제거 (이전 migration 에서 누락)
DROP INDEX IF EXISTS "offices_code_key";

-- ─── commission_payments: side → clientSide + 신규 컬럼 ─────
-- 기존 'partner' side 는 CommissionDistribution 으로 이관되므로 seller/buyer 만 남김.
-- Phase 1 데이터엔 'partner' row 가 없지만 방어적으로 seller 로 치환 (수동 정리 대상).
ALTER TABLE "commission_payments"
  ADD COLUMN "agreed_remaining_date" TIMESTAMP(3),
  ADD COLUMN "base_amount" INTEGER,
  ADD COLUMN "client_side" TEXT,
  ADD COLUMN "code" TEXT,
  ADD COLUMN "collected_by_office" TEXT NOT NULL DEFAULT 'us',
  ADD COLUMN "rate" DECIMAL;

UPDATE "commission_payments"
   SET "client_side" = CASE
     WHEN "side" IN ('seller', 'buyer') THEN "side"
     ELSE 'seller' -- partner 또는 기타 값은 수동 확인 필요
   END;

ALTER TABLE "commission_payments" ALTER COLUMN "client_side" SET NOT NULL;
ALTER TABLE "commission_payments" DROP COLUMN "side";

-- ─── deals: partner_broker_id 컬럼만 추가 ────
-- 수수료 요약 캐시 필드를 두지 않는다. Deal 조회 시 CommissionPayment +
-- CommissionDistribution 을 include 하여 서버에서 계산 후 응답에 동봉한다
-- (shared/commission.ts:computeDealCommissionSummary).
ALTER TABLE "deals" ADD COLUMN "partner_broker_id" UUID;

-- AlterTable
ALTER TABLE "offices" DROP COLUMN "code";

-- AlterTable
ALTER TABLE "proposals" DROP COLUMN "action_payload",
DROP COLUMN "action_type";

-- DropTable
DROP TABLE "insights";

-- CreateTable
CREATE TABLE "proposal_actions" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "tool" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_distributions" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "recipient_type" TEXT NOT NULL,
    "partner_broker_id" UUID,
    "share_ratio" DECIMAL NOT NULL,
    "share_amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "settled_at" TIMESTAMP(3),
    "settlement_memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_adjustments" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "code" TEXT,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "requested_by_id" UUID NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_brokers" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "ceo_name" TEXT,
    "license_no" TEXT,
    "email" TEXT,
    "address" TEXT,
    "memo" TEXT,
    "linked_office_id" UUID,
    "deal_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_brokers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proposal_actions_proposal_id_idx" ON "proposal_actions"("proposal_id");

-- CreateIndex
CREATE INDEX "commission_distributions_office_id_status_idx" ON "commission_distributions"("office_id", "status");

-- CreateIndex
CREATE INDEX "commission_distributions_payment_id_idx" ON "commission_distributions"("payment_id");

-- CreateIndex
CREATE INDEX "commission_distributions_partner_broker_id_idx" ON "commission_distributions"("partner_broker_id");

-- CreateIndex
CREATE INDEX "commission_adjustments_office_id_status_idx" ON "commission_adjustments"("office_id", "status");

-- CreateIndex
CREATE INDEX "commission_adjustments_office_id_code_idx" ON "commission_adjustments"("office_id", "code");

-- CreateIndex
CREATE INDEX "commission_adjustments_payment_id_idx" ON "commission_adjustments"("payment_id");

-- CreateIndex
CREATE INDEX "partner_brokers_office_id_name_idx" ON "partner_brokers"("office_id", "name");

-- CreateIndex
CREATE INDEX "partner_brokers_office_id_is_active_idx" ON "partner_brokers"("office_id", "is_active");

-- CreateIndex
CREATE INDEX "partner_brokers_linked_office_id_idx" ON "partner_brokers"("linked_office_id");

-- CreateIndex
CREATE INDEX "commission_payments_office_id_code_idx" ON "commission_payments"("office_id", "code");

-- CreateIndex
CREATE INDEX "deals_partner_broker_id_idx" ON "deals"("partner_broker_id");

-- AddForeignKey
ALTER TABLE "proposal_actions" ADD CONSTRAINT "proposal_actions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_partner_broker_id_fkey" FOREIGN KEY ("partner_broker_id") REFERENCES "partner_brokers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_payments" ADD CONSTRAINT "deal_payments_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_distributions" ADD CONSTRAINT "commission_distributions_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_distributions" ADD CONSTRAINT "commission_distributions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "commission_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_distributions" ADD CONSTRAINT "commission_distributions_partner_broker_id_fkey" FOREIGN KEY ("partner_broker_id") REFERENCES "partner_brokers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_adjustments" ADD CONSTRAINT "commission_adjustments_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_adjustments" ADD CONSTRAINT "commission_adjustments_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "commission_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_adjustments" ADD CONSTRAINT "commission_adjustments_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_adjustments" ADD CONSTRAINT "commission_adjustments_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_brokers" ADD CONSTRAINT "partner_brokers_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_brokers" ADD CONSTRAINT "partner_brokers_linked_office_id_fkey" FOREIGN KEY ("linked_office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 데이터 이관: 기존 Deal.partner_broker_name/phone → PartnerBroker 생성
-- 같은 (office_id, name) 조합은 하나의 PartnerBroker 로 집계.
-- ============================================================

INSERT INTO "partner_brokers" ("id", "office_id", "name", "phone", "deal_count", "created_at", "updated_at")
SELECT gen_random_uuid(),
       d."office_id",
       d."partner_broker_name",
       MAX(d."partner_broker_phone"),
       COUNT(*)::int,
       NOW(), NOW()
  FROM "deals" d
 WHERE d."partner_broker_name" IS NOT NULL
 GROUP BY d."office_id", d."partner_broker_name";

-- Deal.partner_broker_id 연결
UPDATE "deals" d
   SET "partner_broker_id" = pb."id"
  FROM "partner_brokers" pb
 WHERE d."partner_broker_name" IS NOT NULL
   AND pb."office_id" = d."office_id"
   AND pb."name" = d."partner_broker_name";

-- ─── 이관 완료 후 legacy 컬럼 drop ──────────────────────────
ALTER TABLE "deals"
  DROP COLUMN "commission_buyer_amount",
  DROP COLUMN "commission_buyer_rate",
  DROP COLUMN "commission_seller_amount",
  DROP COLUMN "commission_seller_rate",
  DROP COLUMN "commission_total",
  DROP COLUMN "partner_broker_name",
  DROP COLUMN "partner_broker_phone",
  DROP COLUMN "partner_commission",
  DROP COLUMN "vat";
