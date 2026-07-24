-- 상태 전이 주체 기록: "user" | "system:deal"
-- Deal 자동화가 done 처리한 의뢰만 거래 무산 시 자동 복구한다.
-- 기존 행은 null (주체 불명) — 자동 복구 조건('system:deal')에 걸리지 않아
-- 수동 종료를 뒤집지 않는 안전한 기본값이 된다.
ALTER TABLE "listing_intakes" ADD COLUMN "status_changed_by" TEXT;
