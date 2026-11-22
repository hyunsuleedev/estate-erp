-- 프로젝트에 대표 고객과 담당 직원을 두고, 프로젝트에 적는 코멘트 표를 만든다.
--
-- 대표 고객은 의뢰의 당사자를 복사한 값이 아니라 사용자가 직접 정한 "누구의 일인가"다.
-- 코멘트는 직원이 일에 적는 글이다(손님과 나눈 대화는 상담에 적는다).

ALTER TABLE "projects"
  ADD COLUMN "primary_contact_id" UUID,
  ADD COLUMN "assigned_to_id" UUID;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_primary_contact_id_fkey"
    FOREIGN KEY ("primary_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "projects_assigned_to_id_fkey"
    FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "projects_office_id_primary_contact_id_idx" ON "projects"("office_id", "primary_contact_id");
CREATE INDEX "projects_office_id_assigned_to_id_idx" ON "projects"("office_id", "assigned_to_id");

CREATE TABLE "comments" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "author_id" UUID,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "comments_body_check" CHECK (btrim("body") <> ''),
  CONSTRAINT "comments_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "comments_office_id_project_id_fkey"
    FOREIGN KEY ("office_id", "project_id") REFERENCES "projects"("office_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "comments_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "comments_office_id_project_id_created_at_idx" ON "comments"("office_id", "project_id", "created_at");
