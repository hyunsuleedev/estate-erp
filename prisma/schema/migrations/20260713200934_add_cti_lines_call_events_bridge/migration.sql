-- AlterTable
ALTER TABLE "call_recordings" ADD COLUMN     "call_event_id" UUID;

-- CreateTable
CREATE TABLE "cti_lines" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "provider_code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "external_id" TEXT,
    "internal_no" TEXT,
    "credential_cipher" TEXT,
    "is_master_only" BOOLEAN NOT NULL DEFAULT false,
    "is_delegate" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cti_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_events" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "received_no" TEXT,
    "provider_code" TEXT NOT NULL,
    "channel_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ringing',
    "contact_id" UUID,
    "user_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cti_bridges" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT '마스터 PC',
    "token_hash" TEXT NOT NULL,
    "token_prefix" VARCHAR(12) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cti_bridges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cti_lines_office_id_provider_code_external_id_key" ON "cti_lines"("office_id", "provider_code", "external_id");

-- CreateIndex
CREATE INDEX "call_events_office_id_occurred_at_idx" ON "call_events"("office_id", "occurred_at");

-- CreateIndex
CREATE INDEX "call_events_office_id_phone_number_idx" ON "call_events"("office_id", "phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "call_events_office_id_channel_key_key" ON "call_events"("office_id", "channel_key");

-- CreateIndex
CREATE UNIQUE INDEX "cti_bridges_office_id_key" ON "cti_bridges"("office_id");

-- CreateIndex
CREATE INDEX "cti_bridges_token_prefix_idx" ON "cti_bridges"("token_prefix");

-- AddForeignKey
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_call_event_id_fkey" FOREIGN KEY ("call_event_id") REFERENCES "call_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cti_lines" ADD CONSTRAINT "cti_lines_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cti_bridges" ADD CONSTRAINT "cti_bridges_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
