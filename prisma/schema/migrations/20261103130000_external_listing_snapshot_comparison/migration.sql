-- 광고노트를 출처 중립적인 입력 저장소로 정리하고 스냅샷 비교에 필요한 이전 가격을 저장한다.
-- raw, cell_phone_no 값은 복구되지 않는다.
ALTER TABLE "external_listings"
  DROP COLUMN "cell_phone_no",
  DROP COLUMN "raw",
  ALTER COLUMN "source" DROP DEFAULT,
  ADD COLUMN "previous_price" INTEGER,
  ADD COLUMN "previous_deposit" INTEGER,
  ADD COLUMN "previous_monthly_rent" INTEGER,
  ADD COLUMN "price_changed_at" TIMESTAMP(3);
