-- AlterTable
ALTER TABLE "call_recordings" ADD COLUMN     "analysis" JSONB,
ADD COLUMN     "analysis_status" TEXT NOT NULL DEFAULT 'none';
