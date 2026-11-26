-- 매물의 내부 전용 메모를 없앤다(사용자 결정 2026-11-25). 일반 메모(memo)는 그대로 둔다.
ALTER TABLE "listings" DROP COLUMN "private_memo";
