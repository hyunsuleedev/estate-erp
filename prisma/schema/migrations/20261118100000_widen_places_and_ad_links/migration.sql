-- 자리 구조를 아파트 단지 밖으로 넓히고, 광고를 매물 없이도 저장할 수 있게 한다.
--
-- 1) 대지(sites) · 건물(dongs)에 공공 식별자를 둔다. 단지 코드가 없는 다세대 · 다가구 · 상가 · 토지를
--    필지 번호와 건축물대장 번호로 가리키기 위해서다.
-- 2) 공간(units)을 호뿐 아니라 층 · 층의 일부 · 여러 층으로 넓힌다. 호가 없는 건물이 있기 때문이다.
-- 3) 광고(listing_advertisements)의 연결을 건물 · 관리 공간 · 매물 세 단계로 나눈다.
-- 4) 광고 변경 요청 표를 만든다.
--
-- 모두 칸을 더하거나 필수를 푸는 변경이라 이미 있는 행의 값은 바뀌지 않는다.

-- ── 1) 대지 · 건물 ──────────────────────────────────────────────
ALTER TABLE "sites"
  ADD COLUMN "is_mountain" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pnu" VARCHAR(19),
  ADD COLUMN "related_pnus" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "road_code" TEXT,
  ADD COLUMN "is_underground" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recap_register_pk" TEXT,
  ADD COLUMN "identifier_source" TEXT,
  ADD COLUMN "identified_at" TIMESTAMP(3);

CREATE INDEX "sites_pnu_idx" ON "sites"("pnu");

ALTER TABLE "dongs"
  ADD COLUMN "register_pk" TEXT,
  ADD COLUMN "road_building_mgmt_no" TEXT,
  ADD COLUMN "register_kind" TEXT,
  ADD COLUMN "ground_floors" INTEGER,
  ADD COLUMN "underground_floors" INTEGER,
  ADD COLUMN "main_purpose" TEXT,
  ADD COLUMN "road_building_main" INTEGER,
  ADD COLUMN "road_building_sub" INTEGER;

CREATE INDEX "dongs_register_pk_idx" ON "dongs"("register_pk");
CREATE INDEX "dongs_road_building_mgmt_no_idx" ON "dongs"("road_building_mgmt_no");

-- 대장 종류는 두 가지뿐이다
ALTER TABLE "dongs"
  ADD CONSTRAINT "dongs_register_kind_check"
  CHECK ("register_kind" IS NULL OR "register_kind" IN ('collective', 'general'));

-- ── 2) 공간 ─────────────────────────────────────────────────────
ALTER TABLE "units"
  ADD COLUMN "floor_end" INTEGER,
  ADD COLUMN "floor_label" TEXT,
  ADD COLUMN "register_pk" TEXT,
  ALTER COLUMN "name" DROP NOT NULL;

CREATE INDEX "units_register_pk_idx" ON "units"("register_pk");

-- 이름도 층도 없는 공간은 없다. 빈 글자 이름은 이름이 없는 것으로 친다.
ALTER TABLE "units"
  ADD CONSTRAINT "units_name_or_floor_check"
  CHECK (("name" IS NOT NULL AND btrim("name") <> '') OR ("name" IS NULL AND "floor" IS NOT NULL));

-- 0층은 없다 (지하 1층 = -1, 지상 1층 = 1)
ALTER TABLE "units"
  ADD CONSTRAINT "units_floor_not_zero_check"
  CHECK ("floor" IS NULL OR "floor" <> 0);

-- 끝 층은 시작 층이 있을 때만, 그보다 위에 있다
ALTER TABLE "units"
  ADD CONSTRAINT "units_floor_range_check"
  CHECK ("floor_end" IS NULL OR ("floor" IS NOT NULL AND "floor_end" <> 0 AND "floor_end" > "floor"));

-- 같은 건물에 같은 이름의 공공 호가 둘 생기지 않는다
CREATE UNIQUE INDEX "units_public_name_key"
  ON "units" ("dong_id", "name")
  WHERE "office_id" IS NULL AND "name" IS NOT NULL;

-- 한 사무소가 같은 공간(이름 · 층 · 끝 층)을 두 번 만들지 않는다
CREATE UNIQUE INDEX "units_office_space_key"
  ON "units" ("office_id", "dong_id", COALESCE("name", ''), COALESCE("floor", 0), COALESCE("floor_end", 0))
  WHERE "office_id" IS NOT NULL;

-- 관리 공간(properties)은 공공 공간이나 같은 사무소가 만든 공간만 가리킨다.
-- units.office_id가 비어 있을 수 있어 (office_id, id) 조합 FK로는 걸 수 없으므로 트리거로 막는다.
CREATE FUNCTION "properties_unit_office_guard"() RETURNS trigger AS $$
DECLARE
  unit_office UUID;
BEGIN
  IF NEW."unit_id" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "office_id" INTO unit_office FROM "units" WHERE "id" = NEW."unit_id";
  IF unit_office IS NOT NULL AND unit_office <> NEW."office_id" THEN
    RAISE EXCEPTION 'property % cannot point at a unit owned by another office', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "properties_unit_office_guard_trigger"
  BEFORE INSERT OR UPDATE OF "unit_id", "office_id" ON "properties"
  FOR EACH ROW EXECUTE FUNCTION "properties_unit_office_guard"();

-- ── 3) 광고 ─────────────────────────────────────────────────────
ALTER TABLE "listing_advertisements" DROP CONSTRAINT "listing_advertisements_listing_id_fkey";

ALTER TABLE "listing_advertisements"
  ALTER COLUMN "listing_id" DROP NOT NULL,
  ADD COLUMN "property_id" UUID,
  ADD COLUMN "site_id" UUID,
  ADD COLUMN "transaction_type" TEXT,
  ADD COLUMN "raw_jibun_address" TEXT,
  ADD COLUMN "raw_road_address" TEXT,
  ADD COLUMN "raw_site_name" TEXT,
  ADD COLUMN "raw_dong" TEXT,
  ADD COLUMN "raw_ho" TEXT,
  ADD COLUMN "raw_floor_text" TEXT,
  ADD COLUMN "raw_area_m2" DECIMAL,
  ADD COLUMN "floor_exposure" TEXT;

-- 매물이 지워져도 광고는 남는다 (전에는 함께 지워졌다)
ALTER TABLE "listing_advertisements"
  ADD CONSTRAINT "listing_advertisements_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "listing_advertisements_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "listing_advertisements_site_id_fkey"
    FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "listing_advertisements"
  ADD CONSTRAINT "listing_advertisements_floor_exposure_check"
  CHECK ("floor_exposure" IS NULL OR "floor_exposure" IN ('exact', 'band'));

CREATE INDEX "listing_advertisements_office_id_property_id_idx" ON "listing_advertisements"("office_id", "property_id");
CREATE INDEX "listing_advertisements_office_id_site_id_idx" ON "listing_advertisements"("office_id", "site_id");

-- 이미 있는 광고는 모두 매물에 연결돼 있다. 매물을 따라 관리 공간 · 건물 · 거래유형을 채운다.
UPDATE "listing_advertisements" a
SET "property_id" = l."property_id",
    "site_id" = p."site_id",
    "transaction_type" = l."transaction_type"
FROM "listings" l
JOIN "properties" p ON p."id" = l."property_id"
WHERE a."listing_id" = l."id";

-- 수집 중 임시 항목에도 찾은 만큼 적는다
ALTER TABLE "listing_advertisement_snapshot_items"
  ADD COLUMN "property_id" UUID,
  ADD COLUMN "site_id" UUID;

-- ── 4) 광고 변경 요청 ───────────────────────────────────────────
CREATE TABLE "advertisement_change_requests" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "advertisement_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "from_value" JSONB,
    "to_value" JSONB,
    "requested_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advertisement_change_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "advertisement_change_requests_kind_check"
      CHECK ("kind" IN ('price', 'floor_exposure', 'readvertise', 'takedown'))
);

CREATE UNIQUE INDEX "advertisement_change_requests_task_id_key" ON "advertisement_change_requests"("task_id");
CREATE INDEX "advertisement_change_requests_office_id_advertisement_id_idx" ON "advertisement_change_requests"("office_id", "advertisement_id");

ALTER TABLE "advertisement_change_requests"
  ADD CONSTRAINT "advertisement_change_requests_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "advertisement_change_requests_advertisement_id_fkey"
    FOREIGN KEY ("advertisement_id") REFERENCES "listing_advertisements"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "advertisement_change_requests_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "advertisement_change_requests_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
