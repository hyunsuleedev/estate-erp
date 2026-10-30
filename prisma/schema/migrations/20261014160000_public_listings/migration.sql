CREATE UNIQUE INDEX "listings_office_id_id_key" ON "listings"("office_id", "id");
CREATE TABLE "public_listings" (
 "id" UUID NOT NULL, "office_id" UUID NOT NULL, "listing_id" UUID NOT NULL,
 "title" VARCHAR(100) NOT NULL, "description" TEXT NOT NULL,
 "photo_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "is_published" BOOLEAN NOT NULL DEFAULT false,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "public_listings_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "public_listings_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "public_listings_office_id_listing_id_fkey" FOREIGN KEY ("office_id", "listing_id") REFERENCES "listings"("office_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "public_listings_listing_id_key" ON "public_listings"("listing_id");
CREATE INDEX "public_listings_office_id_is_published_updated_at_idx" ON "public_listings"("office_id", "is_published", "updated_at");
CREATE UNIQUE INDEX "public_listings_office_id_listing_id_key" ON "public_listings"("office_id", "listing_id");
