-- Unit values are optional per-unit overrides. When null, callers fall back to
-- the linked site_unit_types value.
ALTER TABLE "units"
  ADD COLUMN "room_count" INTEGER,
  ADD COLUMN "bath_room_count" INTEGER;

ALTER TABLE "units"
  ADD CONSTRAINT "units_room_count_non_negative_check"
    CHECK ("room_count" IS NULL OR "room_count" >= 0),
  ADD CONSTRAINT "units_bath_room_count_non_negative_check"
    CHECK ("bath_room_count" IS NULL OR "bath_room_count" >= 0);

-- 2026-08-22 Aside CLI verification of Naver complex 113907:
-- 단지정보 > 단지 내 면적별 정보 > 방수/욕실수.
UPDATE "site_unit_types" AS sut
SET
  "room_count" = layout."room_count",
  "bath_room_count" = layout."bath_room_count"
FROM "sites" AS site,
  (VALUES
    ('3', 3, 2), ('2', 3, 2), ('1', 3, 2), ('4', 3, 2),
    ('5', 3, 2), ('6', 3, 2), ('7', 3, 2), ('9', 3, 2),
    ('10', 3, 2), ('8', 3, 2), ('11', 4, 2), ('12', 3, 2),
    ('13', 4, 2), ('14', 4, 3), ('15', 4, 2), ('16', 4, 2),
    ('17', 3, 2), ('18', 4, 2), ('19', 4, 3), ('21', 4, 3),
    ('22', 4, 3), ('20', 4, 3)
  ) AS layout("naver_pyeong_no", "room_count", "bath_room_count")
WHERE sut."site_id" = site."id"
  AND site."naver_complex_code" = '113907'
  AND sut."naver_pyeong_no" = layout."naver_pyeong_no";
