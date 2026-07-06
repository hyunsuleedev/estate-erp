-- CreateTable
CREATE TABLE "call_logs" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "user_id" UUID,
    "contact_id" UUID,
    "direction" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "line_number" TEXT,
    "vendor" TEXT,
    "vendor_seqno" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ringing',
    "duration_sec" INTEGER NOT NULL DEFAULT 0,
    "consultation_id" UUID,
    "recording_id" UUID,
    "memo" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "call_logs_office_id_started_at_idx" ON "call_logs"("office_id", "started_at");

-- CreateIndex
CREATE INDEX "call_logs_office_id_phone_number_idx" ON "call_logs"("office_id", "phone_number");

-- CreateIndex
CREATE INDEX "call_logs_contact_id_idx" ON "call_logs"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "call_logs_office_id_vendor_vendor_seqno_key" ON "call_logs"("office_id", "vendor", "vendor_seqno");

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "call_recordings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
