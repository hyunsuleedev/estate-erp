ALTER TABLE "users" ADD COLUMN "clerk_id" TEXT;

CREATE UNIQUE INDEX "users_clerk_id_key" ON "users"("clerk_id");
