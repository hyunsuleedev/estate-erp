-- 종료된 매칭이 어느 단계에서 끝났는지 보존해 파이프라인 실패 지점을 표시한다.
ALTER TABLE "matches"
ADD COLUMN "closed_from_stage" TEXT;
