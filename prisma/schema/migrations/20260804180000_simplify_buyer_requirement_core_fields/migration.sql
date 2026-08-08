-- BuyerRequirement의 핵심 검색조건만 구조화한다.
-- 자유 입력 조건은 요건 메모로 보존하고, area_min/area_max의 의미를
-- 기존 전용면적에서 공급면적으로 전환한다.

UPDATE "buyer_requirements"
SET
  "memo" = NULLIF(
    CONCAT_WS(
      E'\n\n',
      NULLIF(BTRIM("memo"), ''),
      CASE
        WHEN COALESCE(CARDINALITY("must_conditions"), 0) > 0
          THEN '[필수조건]' || E'\n- ' || ARRAY_TO_STRING("must_conditions", E'\n- ')
      END,
      CASE
        WHEN COALESCE(CARDINALITY("prefer_conditions"), 0) > 0
          THEN '[선호조건]' || E'\n- ' || ARRAY_TO_STRING("prefer_conditions", E'\n- ')
      END,
      CASE
        WHEN "area_min" IS NOT NULL OR "area_max" IS NOT NULL
          THEN '[기존 전용면적 조건 · 공급평형 재확인 필요]' || E'\n' ||
            CASE
              WHEN "area_min" IS NOT NULL AND "area_max" IS NOT NULL
                THEN TRIM(TO_CHAR("area_min", 'FM999999990.##')) || '㎡ ~ ' ||
                  TRIM(TO_CHAR("area_max", 'FM999999990.##')) || '㎡'
              WHEN "area_min" IS NOT NULL
                THEN TRIM(TO_CHAR("area_min", 'FM999999990.##')) || '㎡ 이상'
              ELSE TRIM(TO_CHAR("area_max", 'FM999999990.##')) || '㎡ 이하'
            END
      END
    ),
    ''
  ),
  -- 전용면적을 공급면적으로 일률 환산할 수 없으므로 기존 값은 메모에
  -- 보존하고 새 공급평형 조건은 사용자가 다시 확인하도록 비워 둔다.
  "area_min" = NULL,
  "area_max" = NULL
WHERE
  COALESCE(CARDINALITY("must_conditions"), 0) > 0
  OR COALESCE(CARDINALITY("prefer_conditions"), 0) > 0
  OR "area_min" IS NOT NULL
  OR "area_max" IS NOT NULL;

ALTER TABLE "buyer_requirements"
  DROP COLUMN "must_conditions",
  DROP COLUMN "prefer_conditions",
  ALTER COLUMN "area_min" TYPE DECIMAL(10, 2) USING "area_min"::DECIMAL(10, 2),
  ALTER COLUMN "area_max" TYPE DECIMAL(10, 2) USING "area_max"::DECIMAL(10, 2);

COMMENT ON COLUMN "buyer_requirements"."area_min"
  IS 'Desired minimum supply area in square metres; UI uses pyeong';
COMMENT ON COLUMN "buyer_requirements"."area_max"
  IS 'Desired maximum supply area in square metres; UI uses pyeong';
