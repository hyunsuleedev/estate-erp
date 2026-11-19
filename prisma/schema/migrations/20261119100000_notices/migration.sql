-- 공지사항: 에스테잇플로우가 모든 사용자에게 알리는 공지. 사무소 구분이 없다.

CREATE TABLE "notices" (
  "id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "is_required" BOOLEAN NOT NULL DEFAULT false,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notices_title_check" CHECK (btrim("title") <> ''),
  CONSTRAINT "notices_period_check" CHECK ("expires_at" IS NULL OR "expires_at" > "published_at")
);
CREATE INDEX "notices_published_at_idx" ON "notices"("published_at");

CREATE TABLE "notice_reads" (
  "notice_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notice_reads_pkey" PRIMARY KEY ("notice_id", "user_id"),
  CONSTRAINT "notice_reads_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notice_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "notice_reads_user_id_idx" ON "notice_reads"("user_id");
