CREATE TABLE "consumer_requests" (
  "id" UUID NOT NULL,
  "consumer_id" TEXT NOT NULL,
  "ward_code" VARCHAR(10) NOT NULL,
  "region_label" TEXT NOT NULL,
  "recipient_count" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consumer_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "consumer_requests_consumer_id_created_at_idx" ON "consumer_requests"("consumer_id", "created_at");
