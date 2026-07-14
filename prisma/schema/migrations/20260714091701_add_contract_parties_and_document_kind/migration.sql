-- AlterTable
ALTER TABLE "contract_documents" ADD COLUMN     "kind" TEXT,
ADD COLUMN     "kind_order" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "contract_parties" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "side" TEXT NOT NULL,
    "sub_id" INTEGER NOT NULL DEFAULT 1,
    "role" TEXT,
    "name" TEXT NOT NULL,
    "id_type" TEXT,
    "id_number" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "mobile_phone" TEXT,
    "share_percent" TEXT,
    "country" TEXT,
    "contact_id" UUID,
    "parent_id" UUID,
    "agent_label" TEXT,
    "office_name" TEXT,
    "office_reg_no" TEXT,
    "partner_office_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_parties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contract_parties_office_id_contract_id_idx" ON "contract_parties"("office_id", "contract_id");

-- CreateIndex
CREATE INDEX "contract_parties_contact_id_idx" ON "contract_parties"("contact_id");

-- CreateIndex
CREATE INDEX "contract_parties_parent_id_idx" ON "contract_parties"("parent_id");

-- AddForeignKey
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "contract_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "contract_document_revisions_office_id_document_id_created_at_id" RENAME TO "contract_document_revisions_office_id_document_id_created_a_idx";
