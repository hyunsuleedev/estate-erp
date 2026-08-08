WITH request_plan AS (
    SELECT
        request."id",
        request."office_id",
        request."capability",
        request."review_status",
        request."execution_status",
        COALESCE((request."payload" ->> 'republishAfterSave')::boolean, false) AS "republish",
        request."capability" = 'advertisement.terms.set'
            AND (
                request."payload" -> 'advertisedPrice'
                    IS DISTINCT FROM request."evidence" -> 0 -> 'state' -> 'price'
                OR request."payload" -> 'advertisedDeposit'
                    IS DISTINCT FROM request."evidence" -> 0 -> 'state' -> 'deposit'
                OR request."payload" -> 'advertisedMonthlyRent'
                    IS DISTINCT FROM request."evidence" -> 0 -> 'state' -> 'monthlyRent'
                OR COALESCE(request."payload" ->> 'floorExposureMode', '') <> ''
            ) AS "has_terms"
    FROM "agent_action_requests" AS request
    WHERE NOT EXISTS (
        SELECT 1
        FROM "agent_action_execution_steps" AS existing
        WHERE existing."request_id" = request."id"
    )
),
step_definitions("step_key", "position") AS (
    VALUES
        ('target_confirm', 1),
        ('terms_save', 2),
        ('saved_state_verify', 3),
        ('exposure_end', 4),
        ('republish', 5),
        ('ad_registration', 6),
        ('payment_send', 7),
        ('final_verify', 8)
),
planned_steps AS (
    SELECT
        request_plan.*,
        step_definitions."step_key",
        step_definitions."position",
        CASE
            WHEN step_definitions."step_key" IN ('target_confirm', 'final_verify') THEN true
            WHEN step_definitions."step_key" IN ('terms_save', 'saved_state_verify')
                THEN request_plan."has_terms"
            WHEN step_definitions."step_key" = 'exposure_end'
                THEN request_plan."capability" = 'advertisement.takedown'
                    OR request_plan."republish"
            WHEN step_definitions."step_key" IN (
                'republish',
                'ad_registration',
                'payment_send'
            ) THEN request_plan."republish"
            ELSE false
        END AS "required"
    FROM request_plan
    CROSS JOIN step_definitions
)
INSERT INTO "agent_action_execution_steps" (
    "id",
    "office_id",
    "request_id",
    "step_key",
    "position",
    "status",
    "attempt",
    "message",
    "finished_at",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    planned_steps."office_id",
    planned_steps."id",
    planned_steps."step_key",
    planned_steps."position",
    CASE
        WHEN planned_steps."review_status" IN (
            'rejected',
            'withdrawn',
            'expired',
            'stale',
            'superseded'
        ) OR planned_steps."execution_status" = 'cancelled' THEN 'skipped'
        WHEN NOT planned_steps."required" THEN 'skipped'
        WHEN planned_steps."execution_status" = 'succeeded' THEN 'succeeded'
        ELSE 'pending'
    END,
    0,
    CASE
        WHEN planned_steps."review_status" IN (
            'rejected',
            'withdrawn',
            'expired',
            'stale',
            'superseded'
        ) OR planned_steps."execution_status" = 'cancelled'
            THEN '단계 추적 도입 전 종료된 요청에서 이관'
        WHEN NOT planned_steps."required"
            THEN '이번 실행 범위에 포함되지 않아 건너뜀'
        WHEN planned_steps."execution_status" = 'succeeded'
            THEN '단계 추적 도입 전 완료된 요청에서 이관'
        ELSE '단계 추적 도입 전 요청에서 이관'
    END,
    CASE
        WHEN planned_steps."execution_status" IN ('succeeded', 'cancelled')
            OR planned_steps."review_status" IN (
                'rejected',
                'withdrawn',
                'expired',
                'stale',
                'superseded'
            )
            OR NOT planned_steps."required"
            THEN CURRENT_TIMESTAMP
        ELSE NULL
    END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM planned_steps;
