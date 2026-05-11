-- AlterTable: users
-- Supabase Auth (인증만 외주) 통합용 컬럼 추가.
-- 사장님 발급 모델 (모델 B):
--   - 사장님 admin.createUser → Supabase auth.users + 자체 users 동시 생성
--   - 합성 이메일 (loginId@estate-erp.local) → Supabase email
--   - 비번 복구는 사장님이 admin API로 처리 (옵션 1)

ALTER TABLE "users"
  ADD COLUMN "supabase_id" UUID,
  ADD COLUMN "synthetic_email" TEXT,
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "password_changed_at" TIMESTAMP(3),
  ADD COLUMN "last_login_at" TIMESTAMP(3);

-- Unique 제약
CREATE UNIQUE INDEX "users_supabase_id_key" ON "users"("supabase_id");
CREATE UNIQUE INDEX "users_synthetic_email_key" ON "users"("synthetic_email");
