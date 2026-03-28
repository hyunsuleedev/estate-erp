/*
  Warnings:

  - You are about to drop the column `name` on the `tenants` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `tenants` table. All the data in the column will be lost.
  - Made the column `contact_id` on table `tenants` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "tenants" DROP CONSTRAINT "tenants_contact_id_fkey";

-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "name",
DROP COLUMN "phone",
ALTER COLUMN "contact_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
