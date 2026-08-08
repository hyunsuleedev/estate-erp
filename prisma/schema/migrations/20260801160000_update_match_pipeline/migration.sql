-- 매칭 단계를 연락 시도보다 확인된 업무 결과 중심으로 정리한다.
-- buyerContacted(고객 연락) -> buyerInterested(고객 관심 확인)
-- ownerContacted(집주인 연락) -> viewingConfirmed(집주인·점유자 임장 가능 확인)
UPDATE "matches"
SET "stage" = 'buyerInterested'
WHERE "stage" = 'buyerContacted';

UPDATE "matches"
SET "stage" = 'viewingConfirmed'
WHERE "stage" = 'ownerContacted';
