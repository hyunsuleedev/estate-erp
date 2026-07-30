-- 사무소별 외부 수집 대상. 관리단지(office_sites)와 별개 축이며, 수집 경로는
-- sites.naver_complex_code 대신 이 테이블만 읽는다.
CREATE TABLE "external_listing_sources" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "site_id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "external_code" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "last_collected_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "external_listing_sources_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "external_listing_sources"
ADD CONSTRAINT "external_listing_sources_office_id_fkey"
FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "external_listing_sources"
ADD CONSTRAINT "external_listing_sources_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 한 사무소가 같은 단지를 같은 플랫폼에 두 번 등록할 수 없다.
CREATE UNIQUE INDEX "external_listing_sources_office_id_site_id_provider_key"
ON "external_listing_sources"("office_id", "site_id", "provider");

CREATE INDEX "external_listing_sources_office_id_provider_is_enabled_idx"
ON "external_listing_sources"("office_id", "provider", "is_enabled");

CREATE INDEX "external_listing_sources_office_id_external_code_idx"
ON "external_listing_sources"("office_id", "external_code");
