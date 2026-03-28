/*
  Warnings:

  - You are about to drop the column `address` on the `contacts` table. All the data in the column will be lost.
  - You are about to drop the column `company` on the `contacts` table. All the data in the column will be lost.
  - You are about to drop the `ownerships` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ownerships" DROP CONSTRAINT "ownerships_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "ownerships" DROP CONSTRAINT "ownerships_office_id_fkey";

-- DropForeignKey
ALTER TABLE "ownerships" DROP CONSTRAINT "ownerships_property_id_fkey";

-- AlterTable
ALTER TABLE "contacts" DROP COLUMN "address",
DROP COLUMN "company";

-- DropTable
DROP TABLE "ownerships";

-- CreateTable
CREATE TABLE "contact_relations" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "related_contact_id" UUID NOT NULL,
    "relation_type" TEXT NOT NULL,
    "label" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_contacts" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "share_ratio" DECIMAL,
    "is_resident" BOOLEAN NOT NULL DEFAULT false,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "contact_id" UUID,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "deposit" INTEGER,
    "monthly_rent" INTEGER,
    "contract_start" TIMESTAMP(3),
    "contract_end" TIMESTAMP(3),
    "move_out_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'residing',
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_relations_office_id_idx" ON "contact_relations"("office_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_relations_contact_id_related_contact_id_key" ON "contact_relations"("contact_id", "related_contact_id");

-- CreateIndex
CREATE INDEX "property_contacts_office_id_idx" ON "property_contacts"("office_id");

-- CreateIndex
CREATE INDEX "property_contacts_property_id_idx" ON "property_contacts"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_contacts_contact_id_property_id_role_key" ON "property_contacts"("contact_id", "property_id", "role");

-- CreateIndex
CREATE INDEX "tenants_office_id_idx" ON "tenants"("office_id");

-- CreateIndex
CREATE INDEX "tenants_property_id_idx" ON "tenants"("property_id");

-- AddForeignKey
ALTER TABLE "contact_relations" ADD CONSTRAINT "contact_relations_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_relations" ADD CONSTRAINT "contact_relations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_relations" ADD CONSTRAINT "contact_relations_related_contact_id_fkey" FOREIGN KEY ("related_contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_contacts" ADD CONSTRAINT "property_contacts_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_contacts" ADD CONSTRAINT "property_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_contacts" ADD CONSTRAINT "property_contacts_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
