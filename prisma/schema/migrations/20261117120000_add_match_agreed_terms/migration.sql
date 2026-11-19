-- 매칭에 협상 중 합의 조건을 적어 둘 칸을 둔다(가격·보증금·월세·입주일, 모두 선택).
-- 거래(deals)의 합의 조건과 이름·타입·단위가 같다. 거래로 전환할 때 그쪽으로 넘긴다.
-- 칸을 더하기만 하므로 이미 있는 매칭은 모두 빈 값으로 남는다.
ALTER TABLE "matches"
  ADD COLUMN "agreed_price" INTEGER,
  ADD COLUMN "agreed_deposit" INTEGER,
  ADD COLUMN "agreed_monthly_rent" INTEGER,
  ADD COLUMN "agreed_move_in_date" TIMESTAMP(3);
