-- 직원 인증은 Auth0(users.auth0_id)만 쓴다. 옮길 운영 사용자가 없어 대응 키였던 clerk_id를 지운다.
DROP INDEX IF EXISTS "users_clerk_id_key";

ALTER TABLE "users" DROP COLUMN IF EXISTS "clerk_id";
