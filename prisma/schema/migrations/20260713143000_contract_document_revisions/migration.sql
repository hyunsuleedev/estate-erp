-- Contract documents keep the last applied payload in contract_documents.metadata.
-- Every proposed payload is immutable and can only be applied by exact id + hash.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE "contract_documents"
  ADD COLUMN "current_revision_id" UUID;

CREATE TABLE "contract_document_revisions" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "revision_no" INTEGER NOT NULL,
  "content_hash" VARCHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_by" TEXT,
  "applied_at" TIMESTAMP(3),

  CONSTRAINT "contract_document_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_document_revisions_document_id_revision_no_key"
  ON "contract_document_revisions"("document_id", "revision_no");
CREATE INDEX "contract_document_revisions_office_id_document_id_created_at_idx"
  ON "contract_document_revisions"("office_id", "document_id", "created_at");
CREATE INDEX "contract_document_revisions_content_hash_idx"
  ON "contract_document_revisions"("content_hash");
CREATE UNIQUE INDEX "contract_documents_current_revision_id_key"
  ON "contract_documents"("current_revision_id");

ALTER TABLE "contract_document_revisions"
  ADD CONSTRAINT "contract_document_revisions_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "contract_documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_document_revisions"
  ADD CONSTRAINT "contract_document_revisions_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing metadata is already the active document content. Preserve it as revision 1
-- before introducing the current-revision pointer.
INSERT INTO "contract_document_revisions" (
  "id",
  "office_id",
  "document_id",
  "revision_no",
  "content_hash",
  "payload",
  "created_by",
  "created_at",
  "applied_by",
  "applied_at"
)
SELECT
  gen_random_uuid(),
  d."office_id",
  d."id",
  1,
  encode(digest(convert_to(d."metadata"::text, 'UTF8'), 'sha256'), 'hex'),
  d."metadata",
  COALESCE(d."generated_by_id"::text, 'system:migration'),
  d."created_at",
  COALESCE(d."generated_by_id"::text, 'system:migration'),
  d."created_at"
FROM "contract_documents" d;

UPDATE "contract_documents" d
SET "current_revision_id" = r."id"
FROM "contract_document_revisions" r
WHERE r."document_id" = d."id"
  AND r."revision_no" = 1;

ALTER TABLE "contract_documents"
  ADD CONSTRAINT "contract_documents_current_revision_id_fkey"
  FOREIGN KEY ("current_revision_id") REFERENCES "contract_document_revisions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Applying a revision may stamp applied_by/applied_at, but the reviewed
-- document content and identity are immutable after insertion.
CREATE FUNCTION prevent_contract_revision_content_mutation()
RETURNS trigger AS $$
BEGIN
  IF NEW."office_id" IS DISTINCT FROM OLD."office_id"
     OR NEW."document_id" IS DISTINCT FROM OLD."document_id"
     OR NEW."revision_no" IS DISTINCT FROM OLD."revision_no"
     OR NEW."content_hash" IS DISTINCT FROM OLD."content_hash"
     OR NEW."payload" IS DISTINCT FROM OLD."payload"
     OR NEW."created_by" IS DISTINCT FROM OLD."created_by"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'contract document revision content is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "contract_document_revisions_content_immutable"
  BEFORE UPDATE ON "contract_document_revisions"
  FOR EACH ROW EXECUTE FUNCTION prevent_contract_revision_content_mutation();
