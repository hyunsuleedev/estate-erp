-- AlterTable
ALTER TABLE "consultations" ADD COLUMN     "call_recording_id" UUID;

-- CreateTable
CREATE TABLE "call_recordings" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "contact_id" UUID,
    "user_id" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "duration_sec" INTEGER NOT NULL DEFAULT 0,
    "file_name" TEXT,
    "file_url" TEXT,
    "file_size" INTEGER,
    "stt_status" TEXT NOT NULL DEFAULT 'pending',
    "called_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_recording_messages" (
    "id" UUID NOT NULL,
    "recording_id" UUID NOT NULL,
    "speaker" INTEGER NOT NULL,
    "speaker_label" TEXT,
    "text" TEXT NOT NULL,
    "start_ms" INTEGER NOT NULL,
    "end_ms" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_recording_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "call_recordings_office_id_called_at_idx" ON "call_recordings"("office_id", "called_at");

-- CreateIndex
CREATE INDEX "call_recordings_office_id_phone_number_idx" ON "call_recordings"("office_id", "phone_number");

-- CreateIndex
CREATE INDEX "call_recordings_contact_id_idx" ON "call_recordings"("contact_id");

-- CreateIndex
CREATE INDEX "call_recording_messages_recording_id_seq_idx" ON "call_recording_messages"("recording_id", "seq");

-- AddForeignKey
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_recording_messages" ADD CONSTRAINT "call_recording_messages_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "call_recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_call_recording_id_fkey" FOREIGN KEY ("call_recording_id") REFERENCES "call_recordings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
