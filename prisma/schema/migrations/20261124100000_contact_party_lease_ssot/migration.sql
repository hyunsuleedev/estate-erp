-- ============================================================
-- Contact(person|organization), Party(household|organization),
-- PropertyLease/PropertyLeaseTenant, ListingIntake requester,
-- ContractParty SSOT, activity context FKs, PartnerBrokerContact,
-- and full composite (office_id, contact_id) tenant FKs.
-- ============================================================

-- 1. contacts 확장 (개인/법인, 사업자번호, 소개자)
ALTER TABLE "contacts"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'person',
  ADD COLUMN "business_reg_no" TEXT,
  ADD COLUMN "referred_by_contact_id" UUID;

ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_kind_check"
  CHECK ("kind" IN ('person', 'organization'));

CREATE UNIQUE INDEX "contacts_office_id_id_kind_key"
  ON "contacts"("office_id", "id", "kind");

CREATE INDEX "contacts_office_id_kind_idx"
  ON "contacts"("office_id", "kind");

CREATE INDEX "contacts_office_id_referred_by_contact_id_idx"
  ON "contacts"("office_id", "referred_by_contact_id");

ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_office_id_referred_by_contact_id_fkey"
  FOREIGN KEY ("office_id", "referred_by_contact_id")
  REFERENCES "contacts"("office_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. parties & party_members (household / organization 통합 집단)
CREATE TABLE "parties" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "office_id" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT,
  "organization_contact_id" UUID,
  "organization_contact_kind" TEXT,
  "home_phone" TEXT,
  "memo" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "parties_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "parties_kind_check" CHECK ("kind" IN ('household', 'organization')),
  CONSTRAINT "parties_org_contact_pair_check" CHECK (
    ("kind" = 'organization' AND "organization_contact_id" IS NOT NULL AND "organization_contact_kind" = 'organization')
    OR
    ("kind" = 'household' AND "organization_contact_id" IS NULL AND "organization_contact_kind" IS NULL)
  ),
  CONSTRAINT "parties_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parties_office_id_organization_contact_id_organization_cont_fkey"
    FOREIGN KEY ("office_id", "organization_contact_id", "organization_contact_kind")
    REFERENCES "contacts"("office_id", "id", "kind") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "parties_office_id_id_key" ON "parties"("office_id", "id");
CREATE UNIQUE INDEX "parties_office_id_id_kind_key" ON "parties"("office_id", "id", "kind");
CREATE UNIQUE INDEX "parties_office_id_organization_contact_id_key" ON "parties"("office_id", "organization_contact_id");
CREATE UNIQUE INDEX "parties_office_id_organization_contact_id_organization_cont_key" ON "parties"("office_id", "organization_contact_id", "organization_contact_kind");
CREATE INDEX "parties_office_id_kind_idx" ON "parties"("office_id", "kind");

CREATE TABLE "party_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "office_id" UUID NOT NULL,
  "party_id" UUID NOT NULL,
  "party_kind" TEXT NOT NULL,
  "contact_id" UUID NOT NULL,
  "contact_kind" TEXT NOT NULL DEFAULT 'person',
  "role_label" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'active',
  "memo" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "party_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "party_members_party_kind_check" CHECK ("party_kind" IN ('household', 'organization')),
  CONSTRAINT "party_members_contact_kind_check" CHECK ("contact_kind" = 'person'),
  CONSTRAINT "party_members_status_check" CHECK ("status" IN ('active', 'inactive')),
  CONSTRAINT "party_members_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "party_members_office_id_party_id_party_kind_fkey"
    FOREIGN KEY ("office_id", "party_id", "party_kind")
    REFERENCES "parties"("office_id", "id", "kind") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "party_members_office_id_contact_id_contact_kind_fkey"
    FOREIGN KEY ("office_id", "contact_id", "contact_kind")
    REFERENCES "contacts"("office_id", "id", "kind") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "party_members_office_id_party_id_idx" ON "party_members"("office_id", "party_id");
CREATE INDEX "party_members_office_id_contact_id_idx" ON "party_members"("office_id", "contact_id");

CREATE UNIQUE INDEX "party_members_active_unique"
  ON "party_members"("party_id", "contact_id")
  WHERE "status" = 'active';

CREATE UNIQUE INDEX "party_members_one_household_per_person"
  ON "party_members"("office_id", "contact_id")
  WHERE "party_kind" = 'household' AND "status" = 'active';

CREATE UNIQUE INDEX "party_members_one_primary_per_party"
  ON "party_members"("office_id", "party_id")
  WHERE "is_primary" = true AND "status" = 'active';

-- 기존 contact_relations 연결 컴포넌트를 무손실로 household Party로 이관
WITH RECURSIVE
  edges AS (
    SELECT "office_id", "contact_id" AS "a", "related_contact_id" AS "b", "relation_type", "label", "inverse_label", "memo", "created_at"
    FROM "contact_relations"
    UNION ALL
    SELECT "office_id", "related_contact_id" AS "a", "contact_id" AS "b", "relation_type", "inverse_label" AS "label", "label" AS "inverse_label", "memo", "created_at"
    FROM "contact_relations"
  ),
  nodes AS (
    SELECT DISTINCT "office_id", "a" AS "contact_id" FROM edges
  ),
  reach("office_id", "start_id", "node_id") AS (
    SELECT "office_id", "contact_id", "contact_id" FROM nodes
    UNION
    SELECT r."office_id", r."start_id", e."b"
    FROM reach r
    JOIN edges e ON e."office_id" = r."office_id" AND e."a" = r."node_id"
  ),
  components AS (
    SELECT "office_id", "start_id" AS "contact_id", MIN("node_id"::text)::uuid AS "comp_root"
    FROM reach
    GROUP BY "office_id", "start_id"
  ),
  party_seed AS (
    SELECT DISTINCT
      comp."office_id",
      comp."comp_root",
      gen_random_uuid() AS "party_id",
      COALESCE(c."name", '세대') || ' 님 세대' AS "party_name"
    FROM components comp
    LEFT JOIN "contacts" c ON c."office_id" = comp."office_id" AND c."id" = comp."comp_root"
  ),
  inserted_parties AS (
    INSERT INTO "parties" ("id", "office_id", "kind", "name")
    SELECT "party_id", "office_id", 'household', "party_name"
    FROM party_seed
    RETURNING "id", "office_id"
  )
INSERT INTO "party_members" ("office_id", "party_id", "party_kind", "contact_id", "contact_kind", "role_label", "is_primary", "status")
SELECT
  comp."office_id",
  ps."party_id",
  'household',
  comp."contact_id",
  'person',
  (
    SELECT NULLIF(TRIM(COALESCE(e."label",
      CASE e."relation_type"
        WHEN 'spouse' THEN '배우자'
        WHEN 'parent' THEN '부모'
        WHEN 'child' THEN '자녀'
        WHEN 'sibling' THEN '형제자매'
        WHEN 'grandparent' THEN '조부모'
        WHEN 'grandchild' THEN '손주'
        ELSE NULL
      END
    )), '')
    FROM edges e
    WHERE e."office_id" = comp."office_id" AND e."b" = comp."contact_id"
    ORDER BY e."created_at" ASC
    LIMIT 1
  ),
  (comp."contact_id" = comp."comp_root"),
  'active'
FROM components comp
JOIN party_seed ps ON ps."office_id" = comp."office_id" AND ps."comp_root" = comp."comp_root";

DROP TABLE "contact_relations";

-- 3. contact_phones: 모바일만 사무소 내 유일, 그 외 번호 공유 허용 + 복합 FK
DROP INDEX "contact_phones_office_id_phone_key";
ALTER TABLE "contact_phones" DROP CONSTRAINT "contact_phones_contact_id_fkey";

CREATE UNIQUE INDEX "contact_phones_contact_id_phone_key"
  ON "contact_phones"("contact_id", "phone");
CREATE INDEX "contact_phones_office_id_phone_idx"
  ON "contact_phones"("office_id", "phone");
CREATE UNIQUE INDEX "contact_phones_office_id_mobile_phone_key"
  ON "contact_phones"("office_id", "phone")
  WHERE "label" = 'mobile';

ALTER TABLE "contact_phones"
  ADD CONSTRAINT "contact_phones_office_id_contact_id_fkey"
  FOREIGN KEY ("office_id", "contact_id") REFERENCES "contacts"("office_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. property_contacts: 이력 컬럼 + active 조건부 유니크 + 복합 FK
ALTER TABLE "property_contacts"
  ADD COLUMN "started_at" TIMESTAMP(3),
  ADD COLUMN "ended_at" TIMESTAMP(3),
  ADD COLUMN "source_deal_id" UUID;

DROP INDEX "property_contacts_contact_id_property_id_role_key";
ALTER TABLE "property_contacts" DROP CONSTRAINT "property_contacts_contact_id_fkey";

CREATE INDEX "property_contacts_contact_id_property_id_role_idx"
  ON "property_contacts"("contact_id", "property_id", "role");
CREATE INDEX "property_contacts_source_deal_id_idx"
  ON "property_contacts"("source_deal_id");

-- 혹시 기존 active 중복이 있으면 최신 1건만 active 유지
WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "contact_id", "property_id", "role"
           ORDER BY "is_primary" DESC, "updated_at" DESC, "created_at" DESC
         ) AS rn
  FROM "property_contacts"
  WHERE "status" = 'active'
)
UPDATE "property_contacts" pc
SET "status" = 'archived', "is_primary" = false
FROM ranked r
WHERE pc."id" = r."id" AND r.rn > 1;

CREATE UNIQUE INDEX "property_contacts_active_unique"
  ON "property_contacts"("office_id", "contact_id", "property_id", "role")
  WHERE "status" = 'active';

ALTER TABLE "property_contacts"
  ADD CONSTRAINT "property_contacts_office_id_contact_id_fkey"
  FOREIGN KEY ("office_id", "contact_id") REFERENCES "contacts"("office_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "property_contacts"
  ADD CONSTRAINT "property_contacts_source_deal_id_fkey"
  FOREIGN KEY ("source_deal_id") REFERENCES "deals"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. property_leases & property_lease_tenants (기존 tenants 무손실 이관)
CREATE TABLE "property_leases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "office_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "deposit" INTEGER,
  "monthly_rent" INTEGER,
  "contract_start" TIMESTAMP(3),
  "contract_end" TIMESTAMP(3),
  "move_out_date" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'residing',
  "source_deal_id" UUID,
  "source_contract_id" UUID,
  "memo" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "property_leases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "property_leases_status_check" CHECK ("status" IN ('residing', 'moving_out', 'moved')),
  CONSTRAINT "property_leases_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_leases_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_leases_source_deal_id_fkey"
    FOREIGN KEY ("source_deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "property_leases_source_contract_id_fkey"
    FOREIGN KEY ("source_contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "property_leases_office_id_id_key" ON "property_leases"("office_id", "id");
CREATE INDEX "property_leases_office_id_idx" ON "property_leases"("office_id");
CREATE INDEX "property_leases_office_id_status_contract_end_idx" ON "property_leases"("office_id", "status", "contract_end");
CREATE INDEX "property_leases_property_id_idx" ON "property_leases"("property_id");

CREATE TABLE "property_lease_tenants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "office_id" UUID NOT NULL,
  "lease_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'tenant',
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "memo" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "property_lease_tenants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "property_lease_tenants_role_check" CHECK ("role" IN ('tenant', 'co_tenant', 'resident')),
  CONSTRAINT "property_lease_tenants_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_lease_tenants_office_id_lease_id_fkey"
    FOREIGN KEY ("office_id", "lease_id") REFERENCES "property_leases"("office_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "property_lease_tenants_office_id_contact_id_fkey"
    FOREIGN KEY ("office_id", "contact_id") REFERENCES "contacts"("office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "property_lease_tenants_lease_id_contact_id_key" ON "property_lease_tenants"("lease_id", "contact_id");
CREATE INDEX "property_lease_tenants_office_id_contact_id_idx" ON "property_lease_tenants"("office_id", "contact_id");
CREATE UNIQUE INDEX "property_lease_tenants_one_primary"
  ON "property_lease_tenants"("office_id", "lease_id")
  WHERE "is_primary" = true;

-- 기존 tenants row id를 그대로 property_leases.id로 보존해 무손실 이관
INSERT INTO "property_leases" (
  "id", "office_id", "property_id", "deposit", "monthly_rent",
  "contract_start", "contract_end", "move_out_date", "status", "memo", "created_at", "updated_at"
)
SELECT
  "id", "office_id", "property_id", "deposit", "monthly_rent",
  "contract_start", "contract_end", "move_out_date", "status", "memo", "created_at", "updated_at"
FROM "tenants";

INSERT INTO "property_lease_tenants" (
  "office_id", "lease_id", "contact_id", "role", "is_primary", "created_at", "updated_at"
)
SELECT
  "office_id", "id", "contact_id", 'tenant', true, "created_at", "updated_at"
FROM "tenants";

DROP TABLE "tenants";

-- 6. listing_intakes 의뢰 창구 분리 (requester_contact_id, requester_role)
ALTER TABLE "listing_intakes"
  ADD COLUMN "requester_contact_id" UUID,
  ADD COLUMN "requester_role" TEXT;

ALTER TABLE "listing_intakes"
  ADD CONSTRAINT "listing_intakes_requester_role_check"
  CHECK ("requester_role" IS NULL OR "requester_role" IN ('representative', 'tenant', 'other'));

CREATE INDEX "listing_intakes_office_id_requester_contact_id_idx"
  ON "listing_intakes"("office_id", "requester_contact_id");

ALTER TABLE "listing_intakes"
  ADD CONSTRAINT "listing_intakes_office_id_requester_contact_id_fkey"
  FOREIGN KEY ("office_id", "requester_contact_id")
  REFERENCES "contacts"("office_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. contracts -> ContractParty SSOT 단일화 (buyer_contact_id / seller_contact_id 백필 후 제거)
INSERT INTO "contract_parties" (
  "id", "office_id", "contract_id", "side", "sub_id", "name", "contact_id", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), ct."office_id", ct."id", 'one', 1, COALESCE(c."name", '매도인'), ct."seller_contact_id", ct."created_at", ct."updated_at"
FROM "contracts" ct
JOIN "contacts" c ON c."office_id" = ct."office_id" AND c."id" = ct."seller_contact_id"
WHERE ct."seller_contact_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "contract_parties" cp
    WHERE cp."contract_id" = ct."id" AND cp."side" = 'one' AND cp."parent_id" IS NULL
  );

INSERT INTO "contract_parties" (
  "id", "office_id", "contract_id", "side", "sub_id", "name", "contact_id", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), ct."office_id", ct."id", 'two', 1, COALESCE(c."name", '매수인'), ct."buyer_contact_id", ct."created_at", ct."updated_at"
FROM "contracts" ct
JOIN "contacts" c ON c."office_id" = ct."office_id" AND c."id" = ct."buyer_contact_id"
WHERE ct."buyer_contact_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "contract_parties" cp
    WHERE cp."contract_id" = ct."id" AND cp."side" = 'two' AND cp."parent_id" IS NULL
  );

ALTER TABLE "contracts"
  DROP CONSTRAINT "contracts_buyer_contact_id_fkey",
  DROP CONSTRAINT "contracts_seller_contact_id_fkey",
  DROP COLUMN "buyer_contact_id",
  DROP COLUMN "seller_contact_id";

ALTER TABLE "contract_parties" DROP CONSTRAINT "contract_parties_contact_id_fkey";
UPDATE "contract_parties" cp
SET "contact_id" = NULL
WHERE cp."contact_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "contacts" c WHERE c."office_id" = cp."office_id" AND c."id" = cp."contact_id");

ALTER TABLE "contract_parties"
  ADD CONSTRAINT "contract_parties_office_id_contact_id_fkey"
  FOREIGN KEY ("office_id", "contact_id")
  REFERENCES "contacts"("office_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8. 활동 테이블 누락 컨텍스트 FK 추가 (consultations, tasks, calendar_events)
ALTER TABLE "consultations"
  ADD COLUMN "deal_id" UUID,
  ADD COLUMN "project_id" UUID;

CREATE INDEX "consultations_office_id_deal_id_idx" ON "consultations"("office_id", "deal_id");
CREATE INDEX "consultations_office_id_project_id_idx" ON "consultations"("office_id", "project_id");

ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_deal_id_fkey"
  FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_office_id_project_id_fkey"
  FOREIGN KEY ("office_id", "project_id") REFERENCES "projects"("office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD COLUMN "buyer_intake_id" UUID;
CREATE INDEX "tasks_office_id_buyer_intake_id_idx" ON "tasks"("office_id", "buyer_intake_id");
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_office_id_buyer_intake_id_fkey"
  FOREIGN KEY ("office_id", "buyer_intake_id") REFERENCES "buyer_intakes"("office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "calendar_events"
  ADD COLUMN "buyer_intake_id" UUID,
  ADD COLUMN "project_id" UUID;

CREATE INDEX "calendar_events_office_id_buyer_intake_id_idx" ON "calendar_events"("office_id", "buyer_intake_id");
CREATE INDEX "calendar_events_office_id_project_id_idx" ON "calendar_events"("office_id", "project_id");

ALTER TABLE "calendar_events"
  ADD CONSTRAINT "calendar_events_office_id_buyer_intake_id_fkey"
  FOREIGN KEY ("office_id", "buyer_intake_id") REFERENCES "buyer_intakes"("office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calendar_events"
  ADD CONSTRAINT "calendar_events_office_id_project_id_fkey"
  FOREIGN KEY ("office_id", "project_id") REFERENCES "projects"("office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 9. partner_brokers 복합 unique + partner_broker_contacts (1:N 소속 중개사)
CREATE UNIQUE INDEX "partner_brokers_office_id_id_key" ON "partner_brokers"("office_id", "id");

CREATE TABLE "partner_broker_contacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "office_id" UUID NOT NULL,
  "partner_broker_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "normalized_phone" TEXT NOT NULL,
  "role" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "memo" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "partner_broker_contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "partner_broker_contacts_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "partner_broker_contacts_office_id_partner_broker_id_fkey"
    FOREIGN KEY ("office_id", "partner_broker_id")
    REFERENCES "partner_brokers"("office_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "partner_broker_contacts_office_id_normalized_phone_idx" ON "partner_broker_contacts"("office_id", "normalized_phone");
CREATE INDEX "partner_broker_contacts_partner_broker_id_idx" ON "partner_broker_contacts"("partner_broker_id");

-- 기존 ceo_phone / phone 이 있는 파트너 사무소의 대표 담당자 1줄 백필
INSERT INTO "partner_broker_contacts" (
  "office_id", "partner_broker_id", "name", "phone", "normalized_phone", "role", "is_primary", "sort_order"
)
SELECT
  "office_id",
  "id",
  COALESCE(NULLIF(TRIM("ceo_name"), ''), "name" || ' 대표'),
  COALESCE(NULLIF(TRIM("ceo_phone"), ''), TRIM("phone")),
  regexp_replace(COALESCE(NULLIF(TRIM("ceo_phone"), ''), TRIM("phone")), '[^0-9]', '', 'g'),
  '대표',
  true,
  0
FROM "partner_brokers"
WHERE length(regexp_replace(COALESCE(NULLIF(TRIM("ceo_phone"), ''), NULLIF(TRIM("phone"), ''), ''), '[^0-9]', '', 'g')) >= 7;

-- 10. 나머지 contact 참조 FK들을 전수 복합 테넌트 FK (office_id, contact_id)로 승격
UPDATE "call_action_suggestions" cas
SET "contact_id" = NULL
WHERE cas."contact_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "contacts" c WHERE c."office_id" = cas."office_id" AND c."id" = cas."contact_id");

CREATE INDEX "call_action_suggestions_office_id_contact_id_idx"
  ON "call_action_suggestions"("office_id", "contact_id");
ALTER TABLE "call_action_suggestions"
  ADD CONSTRAINT "call_action_suggestions_office_id_contact_id_fkey"
  FOREIGN KEY ("office_id", "contact_id") REFERENCES "contacts"("office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "consultations" DROP CONSTRAINT "consultations_contact_id_fkey";
ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_office_id_contact_id_fkey"
  FOREIGN KEY ("office_id", "contact_id") REFERENCES "contacts"("office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deals"
  DROP CONSTRAINT "deals_buyer_contact_id_fkey",
  DROP CONSTRAINT "deals_seller_contact_id_fkey";
ALTER TABLE "deals"
  ADD CONSTRAINT "deals_office_id_buyer_contact_id_fkey"
  FOREIGN KEY ("office_id", "buyer_contact_id") REFERENCES "contacts"("office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deals"
  ADD CONSTRAINT "deals_office_id_seller_contact_id_fkey"
  FOREIGN KEY ("office_id", "seller_contact_id") REFERENCES "contacts"("office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commission_payments" DROP CONSTRAINT "commission_payments_payer_contact_id_fkey";
ALTER TABLE "commission_payments"
  ADD CONSTRAINT "commission_payments_office_id_payer_contact_id_fkey"
  FOREIGN KEY ("office_id", "payer_contact_id") REFERENCES "contacts"("office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tasks" DROP CONSTRAINT "tasks_contact_id_fkey";
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_office_id_contact_id_fkey"
  FOREIGN KEY ("office_id", "contact_id") REFERENCES "contacts"("office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_contact_id_fkey";
ALTER TABLE "calendar_events"
  ADD CONSTRAINT "calendar_events_office_id_contact_id_fkey"
  FOREIGN KEY ("office_id", "contact_id") REFERENCES "contacts"("office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "call_logs" DROP CONSTRAINT "call_logs_contact_id_fkey";
ALTER TABLE "call_logs"
  ADD CONSTRAINT "call_logs_office_id_contact_id_fkey"
  FOREIGN KEY ("office_id", "contact_id") REFERENCES "contacts"("office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "call_recordings" DROP CONSTRAINT "call_recordings_contact_id_fkey";
ALTER TABLE "call_recordings"
  ADD CONSTRAINT "call_recordings_office_id_contact_id_fkey"
  FOREIGN KEY ("office_id", "contact_id") REFERENCES "contacts"("office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "projects" DROP CONSTRAINT "projects_primary_contact_id_fkey";
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_office_id_primary_contact_id_fkey"
  FOREIGN KEY ("office_id", "primary_contact_id") REFERENCES "contacts"("office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
