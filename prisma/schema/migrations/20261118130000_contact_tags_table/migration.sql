-- 연락처 태그를 글자 배열(contacts.tags)에서 표로 옮긴다.
-- 이름은 앞뒤 공백을 떼고 가운데 공백을 하나로 줄여 같은 말을 한 태그로 합친다.
-- 대소문자는 합치지 않는다('VIP'와 'vip'가 둘 다 있으면 둘 다 남는다 — 사람이 보고 정리한다).

CREATE TABLE "contact_tags" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contact_tags_color_check" CHECK (
      "color" IN ('gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red')
    ),
    CONSTRAINT "contact_tags_name_check" CHECK (
      "name" <> '' AND "name" = BTRIM("name") AND POSITION(',' IN "name") = 0
    )
);

CREATE UNIQUE INDEX "contact_tags_office_id_name_key" ON "contact_tags"("office_id", "name");
CREATE UNIQUE INDEX "contact_tags_office_id_id_key" ON "contact_tags"("office_id", "id");

CREATE TABLE "contact_tag_assignments" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "added_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_tag_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_tag_assignments_tag_id_contact_id_key" ON "contact_tag_assignments"("tag_id", "contact_id");
CREATE INDEX "contact_tag_assignments_office_id_contact_id_idx" ON "contact_tag_assignments"("office_id", "contact_id");

ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact_tag_assignments" ADD CONSTRAINT "contact_tag_assignments_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact_tag_assignments" ADD CONSTRAINT "contact_tag_assignments_office_id_tag_id_fkey" FOREIGN KEY ("office_id", "tag_id") REFERENCES "contact_tags"("office_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_tag_assignments" ADD CONSTRAINT "contact_tag_assignments_office_id_contact_id_fkey" FOREIGN KEY ("office_id", "contact_id") REFERENCES "contacts"("office_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_tag_assignments" ADD CONSTRAINT "contact_tag_assignments_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 기존 태그를 옮긴다. 쉼표가 든 옛 태그('a,b')는 쉼표를 공백으로 바꿔 한 태그로 둔다
-- (쉼표는 목록 조회의 태그 구분자라 이름에 쓸 수 없다).
-- 화면에서 숨겨 온 옛 태그 '중개사무소'는 옮기지 않는다.
CREATE TEMP TABLE "_contact_tag_source" ON COMMIT DROP AS
SELECT
  c."office_id",
  c."id" AS "contact_id",
  BTRIM(REGEXP_REPLACE(REPLACE(u.raw, ',', ' '), '\s+', ' ', 'g')) AS "name",
  u.ord
FROM "contacts" c, unnest(c."tags") WITH ORDINALITY AS u(raw, ord);

DELETE FROM "_contact_tag_source" WHERE "name" = '' OR "name" = '중개사무소';

-- 색은 사무소마다 이름 순으로 아홉 색을 돌려 가며 붙인다.
INSERT INTO "contact_tags" ("id", "office_id", "name", "color")
SELECT
  gen_random_uuid(),
  d."office_id",
  d."name",
  (ARRAY['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'])[
    ((ROW_NUMBER() OVER (PARTITION BY d."office_id" ORDER BY d."name") - 1) % 9) + 1
  ]
FROM (SELECT DISTINCT "office_id", "name" FROM "_contact_tag_source") d;

INSERT INTO "contact_tag_assignments" ("id", "office_id", "tag_id", "contact_id", "created_at")
SELECT
  gen_random_uuid(),
  s."office_id",
  t."id",
  s."contact_id",
  -- 한 사람 안에서 원래 적힌 순서가 유지되도록 순서만큼 밀어 적는다.
  CURRENT_TIMESTAMP + (MIN(s.ord) * INTERVAL '1 millisecond')
FROM "_contact_tag_source" s
JOIN "contact_tags" t ON t."office_id" = s."office_id" AND t."name" = s."name"
GROUP BY s."office_id", t."id", s."contact_id";

ALTER TABLE "contacts" DROP COLUMN "tags";
