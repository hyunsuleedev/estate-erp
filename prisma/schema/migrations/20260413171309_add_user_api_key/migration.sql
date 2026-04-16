-- AlterTable
ALTER TABLE "users" ADD COLUMN     "api_key_hash" TEXT,
ADD COLUMN     "api_key_prefix" VARCHAR(12);
