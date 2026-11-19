-- 사람 ↔ 사람 관계에는 의뢰가 끝나도 변하지 않는 관계(가족)만 둔다.
-- 법무사·세무사는 의뢰마다 달라지므로 매물 관계자(property_contacts.role)에만 적는다.
-- 조부모 ↔ 손주를 더한다.

ALTER TABLE "contact_relations"
  DROP CONSTRAINT "contact_relations_type_check";

-- 이미 있는 법무사·세무사 줄은 지우지 않는다. '기타'로 바꾸고, 보충 이름이 비어 있으면
-- 원래 뜻을 보충 이름에 남긴다(상대 쪽에서는 '의뢰인'으로 보이던 값).
UPDATE "contact_relations"
SET
  "label" = COALESCE(
    NULLIF(BTRIM("label"), ''),
    CASE "relation_type" WHEN 'lawyer' THEN '법무사' ELSE '세무사' END
  ),
  "inverse_label" = COALESCE(NULLIF(BTRIM("inverse_label"), ''), '의뢰인'),
  "relation_type" = 'other',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "relation_type" IN ('lawyer', 'tax_agent');

ALTER TABLE "contact_relations"
  ADD CONSTRAINT "contact_relations_type_check"
    CHECK (
      "relation_type" IN (
        'parent', 'spouse', 'child', 'sibling', 'grandparent', 'grandchild', 'other'
      )
    );
