ALTER TABLE "public_documents"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "request_mode" TEXT NOT NULL DEFAULT 'data',
  ADD COLUMN "batch_id" UUID,
  ADD COLUMN "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "completed_at" TIMESTAMP(3),
  ADD COLUMN "metadata" JSONB;

CREATE INDEX "public_documents_office_id_batch_id_idx"
  ON "public_documents"("office_id", "batch_id");

CREATE INDEX "public_documents_office_id_status_requested_at_idx"
  ON "public_documents"("office_id", "status", "requested_at");
