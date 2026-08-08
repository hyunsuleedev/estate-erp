-- ContactRelation을 방향이 있는 단일 관계선으로 정비한다.
-- relation_type은 related_contact_id가 contact_id에게 어떤 관계인지를 뜻한다.

ALTER TABLE "contact_relations"
  ADD COLUMN "inverse_label" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 기존 데이터가 새 불변식을 위반하면 임의 삭제/병합하지 않고 마이그레이션을
-- 중단한다. 운영자가 관계를 확인한 뒤 다시 적용해야 한다.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "contact_relations"
    WHERE "contact_id" = "related_contact_id"
  ) THEN
    RAISE EXCEPTION 'contact_relations contains a self relation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "contact_relations"
    WHERE "relation_type" NOT IN (
      'parent', 'spouse', 'child', 'sibling', 'lawyer', 'tax_agent', 'other'
    )
  ) THEN
    RAISE EXCEPTION 'contact_relations contains an invalid relation_type';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "contact_relations"
    GROUP BY
      "office_id",
      LEAST("contact_id", "related_contact_id"),
      GREATEST("contact_id", "related_contact_id")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'contact_relations contains a duplicate undirected pair';
  END IF;
END $$;

DROP INDEX "contact_relations_contact_id_related_contact_id_key";
DROP INDEX "contact_relations_office_id_idx";

ALTER TABLE "contact_relations"
  ADD CONSTRAINT "contact_relations_no_self_check"
    CHECK ("contact_id" <> "related_contact_id"),
  ADD CONSTRAINT "contact_relations_type_check"
    CHECK (
      "relation_type" IN (
        'parent', 'spouse', 'child', 'sibling', 'lawyer', 'tax_agent', 'other'
      )
    );

-- (A, B)와 (B, A)를 같은 관계 쌍으로 취급한다.
CREATE UNIQUE INDEX "contact_relations_office_id_undirected_pair_key"
  ON "contact_relations" (
    "office_id",
    LEAST("contact_id", "related_contact_id"),
    GREATEST("contact_id", "related_contact_id")
  );

-- FK 삭제 검사와 양방향 관계 조회를 모두 지원한다.
CREATE INDEX "contact_relations_contact_id_office_id_idx"
  ON "contact_relations" ("contact_id", "office_id");
CREATE INDEX "contact_relations_related_contact_id_office_id_idx"
  ON "contact_relations" ("related_contact_id", "office_id");
