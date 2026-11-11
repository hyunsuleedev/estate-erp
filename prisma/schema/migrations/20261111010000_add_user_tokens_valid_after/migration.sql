-- 이 시각 이전에 발급된 접근 토큰(iat)을 거절한다. 비밀번호 재설정·비활성화 때 설정해
-- 이미 발급된 토큰을 만료 전에 끊는다.
ALTER TABLE "users" ADD COLUMN "tokens_valid_after" TIMESTAMP(3);
