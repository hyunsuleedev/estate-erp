DROP INDEX IF EXISTS "users_supabase_id_key";
DROP INDEX IF EXISTS "users_synthetic_email_key";

ALTER TABLE "users"
  DROP COLUMN IF EXISTS "supabase_id",
  DROP COLUMN IF EXISTS "synthetic_email",
  DROP COLUMN IF EXISTS "must_change_password",
  DROP COLUMN IF EXISTS "password_changed_at",
  DROP COLUMN IF EXISTS "refresh_token_hash",
  DROP COLUMN IF EXISTS "password";
