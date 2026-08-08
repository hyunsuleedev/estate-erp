-- 기존 종료 매칭은 감사 로그의 가장 최근 종료 전 단계에서 실패 지점을 복원한다.
WITH latest_close AS (
  SELECT DISTINCT ON ("entity_id")
    "entity_id",
    CASE "changes" -> 'stage' ->> 'before'
      WHEN 'buyerContacted' THEN 'buyerInterested'
      WHEN 'ownerContacted' THEN 'viewingConfirmed'
      ELSE "changes" -> 'stage' ->> 'before'
    END AS "closed_from_stage"
  FROM "activity_logs"
  WHERE "entity_type" = 'match'
    AND "changes" -> 'stage' ->> 'after' = 'closed'
  ORDER BY "entity_id", "created_at" DESC
)
UPDATE "matches" AS m
SET "closed_from_stage" = latest_close."closed_from_stage"
FROM latest_close
WHERE m."id" = latest_close."entity_id"
  AND m."stage" = 'closed'
  AND m."closed_from_stage" IS NULL
  AND latest_close."closed_from_stage" IN (
    'suggested',
    'buyerInterested',
    'viewingConfirmed',
    'viewing',
    'negotiating',
    'dealCreated'
  );
