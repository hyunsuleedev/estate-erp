-- 직원 인증을 Auth0로 옮긴다. 접근 토큰의 sub(Auth0 user_id)로 users를 찾는다.
-- clerk_id는 운영 사용자 이전 때 대응 관계를 찾기 위해 남겨 둔다.
ALTER TABLE "users" ADD COLUMN "auth0_id" TEXT;

CREATE UNIQUE INDEX "users_auth0_id_key" ON "users"("auth0_id");
