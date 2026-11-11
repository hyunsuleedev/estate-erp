-- 사무소가 직접 만드는 연락처 그룹의 이름을 저장한다. 소속은 contacts.tags에 같은 이름으로 남긴다.
CREATE TABLE "contact_groups" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_groups_office_id_name_key" ON "contact_groups"("office_id", "name");

ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
