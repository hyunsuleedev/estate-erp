ALTER TABLE "offices"
  ADD COLUMN "naver_verification_id" TEXT;

COMMENT ON COLUMN "offices"."naver_verification_id" IS
  '네이버 부동산 광고 등록 시 실명인증에 사용하는 사무소 공통 아이디';
