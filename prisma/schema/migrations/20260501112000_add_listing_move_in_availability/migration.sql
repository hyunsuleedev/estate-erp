-- AlterTable
ALTER TABLE "listings" ADD COLUMN "move_in_available_type" TEXT;
ALTER TABLE "listings" ADD COLUMN "move_in_available_from" TIMESTAMP(3);
ALTER TABLE "listings" ADD COLUMN "move_in_available_to" TIMESTAMP(3);
