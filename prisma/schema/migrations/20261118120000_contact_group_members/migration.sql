-- 그룹 소속을 태그 글자에서 연결 표로 옮긴다.
-- 이전: Contact.tags에 그룹 이름을 적어 소속을 나타냈다(그룹과 태그가 같은 데이터).
-- 이후: contact_group_members의 한 줄이 소속이다. 태그는 그 사람을 설명하는 말로만 남는다.

CREATE UNIQUE INDEX "contact_groups_office_id_id_key" ON "contact_groups"("office_id", "id");

CREATE TABLE "contact_group_members" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "added_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_group_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_group_members_group_id_contact_id_key" ON "contact_group_members"("group_id", "contact_id");
CREATE INDEX "contact_group_members_office_id_contact_id_idx" ON "contact_group_members"("office_id", "contact_id");

ALTER TABLE "contact_group_members" ADD CONSTRAINT "contact_group_members_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact_group_members" ADD CONSTRAINT "contact_group_members_office_id_group_id_fkey" FOREIGN KEY ("office_id", "group_id") REFERENCES "contact_groups"("office_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_group_members" ADD CONSTRAINT "contact_group_members_office_id_contact_id_fkey" FOREIGN KEY ("office_id", "contact_id") REFERENCES "contacts"("office_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_group_members" ADD CONSTRAINT "contact_group_members_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 만들어 둔 그룹(contact_groups에 이름이 있는 것)의 소속을 옮긴다.
-- 그룹으로 등록하지 않고 태그로만 쓰던 글자는 그대로 태그로 남는다.
INSERT INTO "contact_group_members" ("id", "office_id", "group_id", "contact_id")
SELECT gen_random_uuid(), g."office_id", g."id", c."id"
FROM "contact_groups" g
JOIN "contacts" c
  ON c."office_id" = g."office_id"
 AND g."name" = ANY(c."tags");

-- 옮긴 그룹 이름은 태그에서 뺀다. 남겨 두면 같은 말이 그룹과 태그로 두 번 보인다.
UPDATE "contacts" c
SET "tags" = ARRAY(
  SELECT t
  FROM unnest(c."tags") WITH ORDINALITY AS u(t, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM "contact_groups" g
    WHERE g."office_id" = c."office_id" AND g."name" = u.t
  )
  ORDER BY ord
)
WHERE EXISTS (
  SELECT 1 FROM "contact_groups" g
  WHERE g."office_id" = c."office_id" AND g."name" = ANY(c."tags")
);
