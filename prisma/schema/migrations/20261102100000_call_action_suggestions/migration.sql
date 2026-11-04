-- 통화 분석 상태 (받아쓰기 업체·오류, 분석 요청 id, 자동 상담 기록)
ALTER TABLE "call_recordings" ADD COLUMN     "analysis_run_id" UUID,
ADD COLUMN     "analyzed_at" TIMESTAMP(3),
ADD COLUMN     "auto_consultation_id" UUID,
ADD COLUMN     "stt_error" TEXT,
ADD COLUMN     "stt_provider" TEXT;

-- 통화 분석이 제안한 업무 (사람이 확인한 뒤 반영)
CREATE TABLE "call_action_suggestions" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "recording_id" UUID NOT NULL,
    "consultation_id" UUID,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "title" TEXT NOT NULL,
    "evidence" TEXT,
    "payload" JSONB NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "applied_entity_type" TEXT,
    "applied_entity_id" UUID,
    "applied_payload" JSONB,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_action_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "call_action_suggestions_office_id_status_created_at_idx" ON "call_action_suggestions"("office_id", "status", "created_at");
CREATE INDEX "call_action_suggestions_recording_id_seq_idx" ON "call_action_suggestions"("recording_id", "seq");
CREATE INDEX "call_action_suggestions_consultation_id_idx" ON "call_action_suggestions"("consultation_id");

ALTER TABLE "call_action_suggestions" ADD CONSTRAINT "call_action_suggestions_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "call_action_suggestions" ADD CONSTRAINT "call_action_suggestions_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "call_recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "call_action_suggestions" ADD CONSTRAINT "call_action_suggestions_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "call_action_suggestions" ADD CONSTRAINT "call_action_suggestions_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
