-- 매칭 종료 이유와 자동 종료를 일으킨 거래.
-- 시스템이 자동 종료한 매칭(다른 손님과 본계약, 의뢰 종료)만 거래 취소 시 되살리기 위해 구분한다.

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "closed_by_deal_id" UUID,
ADD COLUMN     "closed_reason" TEXT;

-- CreateIndex
CREATE INDEX "matches_closed_by_deal_id_idx" ON "matches"("closed_by_deal_id");

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_closed_by_deal_id_fkey" FOREIGN KEY ("closed_by_deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
