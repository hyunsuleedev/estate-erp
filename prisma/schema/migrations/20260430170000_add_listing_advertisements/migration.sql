-- CreateTable
CREATE TABLE "listing_advertisements" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "advertised_price" INTEGER,
    "advertised_deposit" INTEGER,
    "advertised_monthly_rent" INTEGER,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "url" TEXT,
    "memo" TEXT,
    "external_ad_id" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_advertisements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_advertisements_office_id_idx" ON "listing_advertisements"("office_id");

-- CreateIndex
CREATE INDEX "listing_advertisements_listing_id_status_idx" ON "listing_advertisements"("listing_id", "status");

-- CreateIndex
CREATE INDEX "listing_advertisements_office_id_channel_status_idx" ON "listing_advertisements"("office_id", "channel", "status");

-- AddForeignKey
ALTER TABLE "listing_advertisements" ADD CONSTRAINT "listing_advertisements_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_advertisements" ADD CONSTRAINT "listing_advertisements_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
