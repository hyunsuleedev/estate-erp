/*
  dev `db push` 시절 누적된 스키마 드리프트 동기화 전용 마이그레이션.
  (계약 당사자 마이그레이션 20260713195802 와 분리 — 파괴적 DDL 을 기능
  마이그레이션에 번들하지 않는다)

  1. properties.memo — f26afb7 "refactor: move memo from Property to Listing" 이
     스키마에서만 제거하고 (dev 는 db push 로 정리) 마이그레이션을 남기지 않았다.
     migrate deploy 기반 환경에서 데이터가 소실되지 않도록, 컬럼 제거 전에
     연결된 Listing 의 빈 memo 로 백필한다.

  2. contact_phones — dev 전용 DEFAULT 잔재 제거 (드리프트 동기화).

  3. users.office_id FK — 20260526183000 에서 office_id 가 nullable 이 되면서
     Prisma 기본 onDelete 가 SetNull 로 바뀌었지만, 사무소 삭제 시 소속 사용자가
     조용히 orphan(테넌트 없는 로그인 계정) 이 되는 것은 의도가 아니다.
     스키마에 onDelete: Restrict 를 명시하고 FK 를 RESTRICT 로 유지한다.
*/

-- 1. properties.memo → listings.memo 백필 후 컬럼 제거
UPDATE "listings" AS l
SET "memo" = p."memo"
FROM "properties" AS p
WHERE l."property_id" = p."id"
  AND p."memo" IS NOT NULL
  AND p."memo" <> ''
  AND (l."memo" IS NULL OR l."memo" = '');

ALTER TABLE "properties" DROP COLUMN "memo";

-- 2. contact_phones dev 기본값 제거
ALTER TABLE "contact_phones" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- 3. users.office_id FK 를 RESTRICT 로 명시 (사무소 삭제 시 사용자 orphan 방지)
ALTER TABLE "users" DROP CONSTRAINT "users_office_id_fkey";

ALTER TABLE "users" ADD CONSTRAINT "users_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
