-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "phone2" TEXT,
    "email" TEXT,
    "tags" TEXT[],
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_relations" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "related_contact_id" UUID NOT NULL,
    "relation_type" TEXT NOT NULL,
    "label" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_contacts" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "share_ratio" DECIMAL,
    "is_resident" BOOLEAN NOT NULL DEFAULT false,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "deposit" INTEGER,
    "monthly_rent" INTEGER,
    "contract_start" TIMESTAMP(3),
    "contract_end" TIMESTAMP(3),
    "move_out_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'residing',
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultations" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "property_id" UUID,
    "match_id" UUID,
    "buyer_req_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_requirements" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "transaction_type" TEXT,
    "site_types" TEXT[],
    "regions" TEXT[],
    "price_min" INTEGER,
    "price_max" INTEGER,
    "deposit_min" INTEGER,
    "deposit_max" INTEGER,
    "monthly_rent_max" INTEGER,
    "area_min" DECIMAL,
    "area_max" DECIMAL,
    "must_conditions" TEXT[],
    "prefer_conditions" TEXT[],
    "move_in_date" TIMESTAMP(3),
    "assigned_to_id" UUID,
    "last_contact_date" TIMESTAMP(3),
    "next_contact_date" TIMESTAMP(3),
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyer_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "buyer_req_id" UUID NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'suggested',
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'selection',
    "price" INTEGER,
    "buyer_contact_id" UUID,
    "seller_contact_id" UUID,
    "commission_seller_rate" DECIMAL,
    "commission_seller_amount" INTEGER,
    "commission_buyer_rate" DECIMAL,
    "commission_buyer_amount" INTEGER,
    "commission_total" INTEGER,
    "vat" INTEGER,
    "is_joint_brokerage" BOOLEAN NOT NULL DEFAULT false,
    "partner_broker_name" TEXT,
    "partner_broker_phone" TEXT,
    "partner_commission" INTEGER,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "transaction_type" TEXT NOT NULL,
    "buyer_contact_id" UUID NOT NULL,
    "seller_contact_id" UUID NOT NULL,
    "total_price" INTEGER NOT NULL,
    "monthly_rent" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "contract_date" TIMESTAMP(3),
    "contract_deposit" INTEGER,
    "contract_deposit_date" TIMESTAMP(3),
    "contract_deposit_paid" BOOLEAN NOT NULL DEFAULT false,
    "middle_payment" INTEGER,
    "middle_payment_date" TIMESTAMP(3),
    "middle_payment_paid" BOOLEAN NOT NULL DEFAULT false,
    "final_payment" INTEGER,
    "final_payment_date" TIMESTAMP(3),
    "final_payment_paid" BOOLEAN NOT NULL DEFAULT false,
    "move_in_date" TIMESTAMP(3),
    "lease_start_date" TIMESTAMP(3),
    "lease_end_date" TIMESTAMP(3),
    "special_terms" TEXT,
    "attachments" TEXT[],
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_participants" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provinces" (
    "code" VARCHAR(2) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "provinces_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "districts" (
    "code" VARCHAR(5) NOT NULL,
    "province_code" VARCHAR(2) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "wards" (
    "code" VARCHAR(10) NOT NULL,
    "district_code" VARCHAR(5) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "wards_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "network_rooms" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'private',
    "created_by" UUID NOT NULL,
    "region" TEXT,
    "max_members" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_room_members" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "joined_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_room_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_shared_properties" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "shared_by" UUID NOT NULL,
    "show_site_name" BOOLEAN NOT NULL DEFAULT true,
    "show_dong" BOOLEAN NOT NULL DEFAULT false,
    "show_unit" BOOLEAN NOT NULL DEFAULT false,
    "show_price" BOOLEAN NOT NULL DEFAULT true,
    "show_area" BOOLEAN NOT NULL DEFAULT true,
    "show_floor" BOOLEAN NOT NULL DEFAULT false,
    "show_memo" BOOLEAN NOT NULL DEFAULT false,
    "show_photos" BOOLEAN NOT NULL DEFAULT false,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_shared_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_inquiries" (
    "id" UUID NOT NULL,
    "shared_property_id" UUID NOT NULL,
    "from_office_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "response" TEXT,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_messages" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "shared_property_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "link_type" TEXT,
    "link_id" UUID,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offices" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "license_no" TEXT,
    "ceo_name" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "subscription" TEXT NOT NULL DEFAULT 'basic',
    "max_users" INTEGER NOT NULL DEFAULT 3,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "commission_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "login_id" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'agent',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "unit_id" UUID,
    "transaction_type" TEXT NOT NULL,
    "price" INTEGER,
    "deposit" INTEGER,
    "monthly_rent" INTEGER,
    "check_status" TEXT NOT NULL DEFAULT 'unverified',
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_histories" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "changed_by" UUID,
    "price_before" INTEGER,
    "deposit_before" INTEGER,
    "monthly_rent_before" INTEGER,
    "price_after" INTEGER,
    "deposit_after" INTEGER,
    "monthly_rent_after" INTEGER,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL,
    "office_id" UUID,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ward_code" VARCHAR(10) NOT NULL,
    "road_name" TEXT,
    "road_building_main" INTEGER,
    "road_building_sub" INTEGER,
    "road_address" TEXT,
    "jibun_main" TEXT,
    "jibun_sub" TEXT,
    "jibun_address" TEXT,
    "lat" DECIMAL,
    "lng" DECIMAL,
    "kapt_complex_code" TEXT,
    "naver_complex_code" TEXT,
    "kb_complex_code" TEXT,
    "zip_code" TEXT,
    "built_year" INTEGER,
    "total_units" INTEGER,
    "total_dongs" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_sites" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "office_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_unit_types" (
    "id" UUID NOT NULL,
    "office_id" UUID,
    "site_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_type" TEXT,
    "exclusive_area_m2" DECIMAL,
    "supply_area_m2" DECIMAL,
    "contract_area_m2" DECIMAL,
    "room_count" INTEGER,
    "bath_room_count" INTEGER,
    "household_count" INTEGER,
    "entrance_type" TEXT,
    "direction" TEXT,
    "is_duplex" BOOLEAN NOT NULL DEFAULT false,
    "naver_pyeong_no" TEXT,
    "floor_plan_urls" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_unit_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dongs" (
    "id" UUID NOT NULL,
    "office_id" UUID,
    "site_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dongs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "office_id" UUID,
    "site_id" UUID NOT NULL,
    "dong_id" UUID,
    "site_unit_type_id" UUID,
    "name" TEXT NOT NULL,
    "floor" INTEGER,
    "line_no" INTEGER,
    "exclusive_area_m2" DECIMAL,
    "supply_area_m2" DECIMAL,
    "is_piloti" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "due_date" TIMESTAMP(3),
    "contact_id" UUID,
    "property_id" UUID,
    "consultation_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insight_rules" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insight_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'general',
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3),
    "color" TEXT,
    "property_id" UUID,
    "contact_id" UUID,
    "match_id" UUID,
    "deal_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "user_id" UUID,
    "actor" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "changes" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_office_id_phone_idx" ON "contacts"("office_id", "phone");

-- CreateIndex
CREATE INDEX "contact_relations_office_id_idx" ON "contact_relations"("office_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_relations_contact_id_related_contact_id_key" ON "contact_relations"("contact_id", "related_contact_id");

-- CreateIndex
CREATE INDEX "property_contacts_office_id_idx" ON "property_contacts"("office_id");

-- CreateIndex
CREATE INDEX "property_contacts_property_id_idx" ON "property_contacts"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_contacts_contact_id_property_id_role_key" ON "property_contacts"("contact_id", "property_id", "role");

-- CreateIndex
CREATE INDEX "tenants_office_id_idx" ON "tenants"("office_id");

-- CreateIndex
CREATE INDEX "tenants_property_id_idx" ON "tenants"("property_id");

-- CreateIndex
CREATE INDEX "consultations_office_id_contact_id_idx" ON "consultations"("office_id", "contact_id");

-- CreateIndex
CREATE INDEX "consultations_office_id_property_id_idx" ON "consultations"("office_id", "property_id");

-- CreateIndex
CREATE INDEX "buyer_requirements_office_id_status_idx" ON "buyer_requirements"("office_id", "status");

-- CreateIndex
CREATE INDEX "deals_office_id_stage_idx" ON "deals"("office_id", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_deal_id_key" ON "contracts"("deal_id");

-- CreateIndex
CREATE INDEX "contracts_office_id_idx" ON "contracts"("office_id");

-- CreateIndex
CREATE INDEX "contracts_office_id_status_idx" ON "contracts"("office_id", "status");

-- CreateIndex
CREATE INDEX "deal_participants_office_id_user_id_idx" ON "deal_participants"("office_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "deal_participants_deal_id_user_id_role_key" ON "deal_participants"("deal_id", "user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "provinces_name_key" ON "provinces"("name");

-- CreateIndex
CREATE UNIQUE INDEX "districts_province_code_name_key" ON "districts"("province_code", "name");

-- CreateIndex
CREATE UNIQUE INDEX "wards_district_code_name_key" ON "wards"("district_code", "name");

-- CreateIndex
CREATE UNIQUE INDEX "network_room_members_room_id_office_id_key" ON "network_room_members"("room_id", "office_id");

-- CreateIndex
CREATE UNIQUE INDEX "network_shared_properties_room_id_property_id_key" ON "network_shared_properties"("room_id", "property_id");

-- CreateIndex
CREATE INDEX "network_messages_room_id_created_at_idx" ON "network_messages"("room_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_office_id_created_at_idx" ON "notifications"("office_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "offices_code_key" ON "offices"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_login_id_key" ON "users"("login_id");

-- CreateIndex
CREATE INDEX "properties_office_id_check_status_idx" ON "properties"("office_id", "check_status");

-- CreateIndex
CREATE INDEX "properties_site_id_idx" ON "properties"("site_id");

-- CreateIndex
CREATE INDEX "price_histories_property_id_created_at_idx" ON "price_histories"("property_id", "created_at");

-- CreateIndex
CREATE INDEX "sites_office_id_idx" ON "sites"("office_id");

-- CreateIndex
CREATE INDEX "sites_ward_code_idx" ON "sites"("ward_code");

-- CreateIndex
CREATE INDEX "sites_type_idx" ON "sites"("type");

-- CreateIndex
CREATE INDEX "sites_kapt_complex_code_idx" ON "sites"("kapt_complex_code");

-- CreateIndex
CREATE INDEX "sites_naver_complex_code_idx" ON "sites"("naver_complex_code");

-- CreateIndex
CREATE INDEX "sites_kb_complex_code_idx" ON "sites"("kb_complex_code");

-- CreateIndex
CREATE INDEX "sites_name_idx" ON "sites" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "office_sites_office_id_site_id_key" ON "office_sites"("office_id", "site_id");

-- CreateIndex
CREATE INDEX "site_unit_types_site_id_idx" ON "site_unit_types"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_unit_types_site_id_name_key" ON "site_unit_types"("site_id", "name");

-- CreateIndex
CREATE INDEX "units_site_id_dong_id_floor_idx" ON "units"("site_id", "dong_id", "floor");

-- CreateIndex
CREATE INDEX "calendar_events_office_id_start_idx" ON "calendar_events"("office_id", "start");

-- CreateIndex
CREATE INDEX "calendar_events_office_id_user_id_idx" ON "calendar_events"("office_id", "user_id");

-- CreateIndex
CREATE INDEX "activity_logs_office_id_entity_type_entity_id_idx" ON "activity_logs"("office_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "activity_logs_office_id_created_at_idx" ON "activity_logs"("office_id", "created_at");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_relations" ADD CONSTRAINT "contact_relations_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_relations" ADD CONSTRAINT "contact_relations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_relations" ADD CONSTRAINT "contact_relations_related_contact_id_fkey" FOREIGN KEY ("related_contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_contacts" ADD CONSTRAINT "property_contacts_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_contacts" ADD CONSTRAINT "property_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_contacts" ADD CONSTRAINT "property_contacts_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_buyer_req_id_fkey" FOREIGN KEY ("buyer_req_id") REFERENCES "buyer_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_requirements" ADD CONSTRAINT "buyer_requirements_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_requirements" ADD CONSTRAINT "buyer_requirements_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_requirements" ADD CONSTRAINT "buyer_requirements_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_buyer_req_id_fkey" FOREIGN KEY ("buyer_req_id") REFERENCES "buyer_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_buyer_contact_id_fkey" FOREIGN KEY ("buyer_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_seller_contact_id_fkey" FOREIGN KEY ("seller_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_buyer_contact_id_fkey" FOREIGN KEY ("buyer_contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_seller_contact_id_fkey" FOREIGN KEY ("seller_contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_participants" ADD CONSTRAINT "deal_participants_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_participants" ADD CONSTRAINT "deal_participants_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_participants" ADD CONSTRAINT "deal_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "provinces"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wards" ADD CONSTRAINT "wards_district_code_fkey" FOREIGN KEY ("district_code") REFERENCES "districts"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_rooms" ADD CONSTRAINT "network_rooms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_room_members" ADD CONSTRAINT "network_room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "network_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_room_members" ADD CONSTRAINT "network_room_members_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_shared_properties" ADD CONSTRAINT "network_shared_properties_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "network_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_shared_properties" ADD CONSTRAINT "network_shared_properties_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_shared_properties" ADD CONSTRAINT "network_shared_properties_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_shared_properties" ADD CONSTRAINT "network_shared_properties_shared_by_fkey" FOREIGN KEY ("shared_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_inquiries" ADD CONSTRAINT "network_inquiries_shared_property_id_fkey" FOREIGN KEY ("shared_property_id") REFERENCES "network_shared_properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_inquiries" ADD CONSTRAINT "network_inquiries_from_office_id_fkey" FOREIGN KEY ("from_office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_inquiries" ADD CONSTRAINT "network_inquiries_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_messages" ADD CONSTRAINT "network_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "network_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_messages" ADD CONSTRAINT "network_messages_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_messages" ADD CONSTRAINT "network_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_messages" ADD CONSTRAINT "network_messages_shared_property_id_fkey" FOREIGN KEY ("shared_property_id") REFERENCES "network_shared_properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_histories" ADD CONSTRAINT "price_histories_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_histories" ADD CONSTRAINT "price_histories_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_histories" ADD CONSTRAINT "price_histories_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_ward_code_fkey" FOREIGN KEY ("ward_code") REFERENCES "wards"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_sites" ADD CONSTRAINT "office_sites_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_sites" ADD CONSTRAINT "office_sites_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_unit_types" ADD CONSTRAINT "site_unit_types_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_unit_types" ADD CONSTRAINT "site_unit_types_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dongs" ADD CONSTRAINT "dongs_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dongs" ADD CONSTRAINT "dongs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_dong_id_fkey" FOREIGN KEY ("dong_id") REFERENCES "dongs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_site_unit_type_id_fkey" FOREIGN KEY ("site_unit_type_id") REFERENCES "site_unit_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_rules" ADD CONSTRAINT "insight_rules_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
