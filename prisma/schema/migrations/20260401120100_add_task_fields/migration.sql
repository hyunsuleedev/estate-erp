-- AlterTable: add missing task columns
ALTER TABLE "tasks" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "tasks" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "tasks" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'other';
ALTER TABLE "tasks" ADD COLUMN "assigned_to_id" UUID;

-- CreateIndex
CREATE INDEX "tasks_office_id_status_due_date_idx" ON "tasks"("office_id", "status", "due_date");
CREATE INDEX "tasks_office_id_assigned_to_id_idx" ON "tasks"("office_id", "assigned_to_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop old index (is_done based)
DROP INDEX IF EXISTS "tasks_office_id_is_done_due_date_idx";
