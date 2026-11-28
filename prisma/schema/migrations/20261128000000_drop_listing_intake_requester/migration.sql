-- 매물 의뢰의 "의뢰인"(소유자와 다른 사람이 내놓았을 때 그 사람) 칸을 뺀다.
-- 화면도 MCP 도구도 이 칸을 채우거나 보여 주지 않았다. 연락할 사람은 호실에 연결된 소유자·대리인(property_contacts)이다.
-- 칸을 지우면 거기 딸린 색인과 FK도 함께 지워진다.
ALTER TABLE "listing_intakes"
  DROP COLUMN IF EXISTS "requester_contact_id",
  DROP COLUMN IF EXISTS "requester_role";
