/*
  Warnings:

  - You are about to drop the column `desired_price` on the `consultations` table. All the data in the column will be lost.
  - You are about to drop the column `direction` on the `consultations` table. All the data in the column will be lost.
  - You are about to drop the column `next_contact_date` on the `consultations` table. All the data in the column will be lost.
  - You are about to drop the column `result` on the `consultations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "consultations" DROP COLUMN "desired_price",
DROP COLUMN "direction",
DROP COLUMN "next_contact_date",
DROP COLUMN "result";

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "consultation_id" UUID,
ADD COLUMN     "contact_id" UUID,
ADD COLUMN     "property_id" UUID;
