-- 사무소 소유 단지(office_id 있음)는 절대 공개될 수 없다. 공개 단지는 공공데이터(office_id NULL)뿐이다.
-- NOT VALID: 새로 쓰는 행만 검사한다. 컨테이너가 부팅 때 migrate deploy를 실행하므로
-- 기존 행 때문에 마이그레이션이 실패해 서버가 뜨지 못하는 일을 막는다.
ALTER TABLE "sites"
  ADD CONSTRAINT "sites_office_owned_never_public"
  CHECK (NOT ("is_public" AND "office_id" IS NOT NULL)) NOT VALID;
