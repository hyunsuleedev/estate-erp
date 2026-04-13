-- CreateTable
CREATE TABLE "public_documents" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "property_id" UUID,
    "site_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "file_url" TEXT,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "cost" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "requested_by_id" UUID NOT NULL,
    "external_ref_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_documents_office_id_property_id_idx" ON "public_documents"("office_id", "property_id");

-- CreateIndex
CREATE INDEX "public_documents_office_id_site_id_idx" ON "public_documents"("office_id", "site_id");

-- CreateIndex
CREATE INDEX "public_documents_office_id_type_issued_at_idx" ON "public_documents"("office_id", "type", "issued_at");

-- AddForeignKey
ALTER TABLE "public_documents" ADD CONSTRAINT "public_documents_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_documents" ADD CONSTRAINT "public_documents_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_documents" ADD CONSTRAINT "public_documents_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_documents" ADD CONSTRAINT "public_documents_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
