-- OfficeSite는 관리단지 구독 관계이고, 즐겨찾기는 그 관계에 귀속되는
-- 사무소별 표시 속성이다.
ALTER TABLE "office_sites"
ADD COLUMN "is_favorite" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "office_sites_office_id_is_favorite_created_at_idx"
ON "office_sites"("office_id", "is_favorite", "created_at");
