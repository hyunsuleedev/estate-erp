-- 중개 건(brokerage_cases)을 프로젝트(projects)로 이름만 바꾼다.
--
-- 표를 지우고 새로 만들지 않는다. 이름만 바꾸므로 담긴 줄과, Prisma 스키마에 적히지 않는
-- 제약(단계의 CHECK, 부분 유일 색인)이 그대로 남는다. 색인·제약 이름도 새 표·칸 이름에
-- 맞춘다(Prisma가 기대하는 기본 이름과 같아야 다음 마이그레이션에서 차이로 잡히지 않는다).

-- ─── 1. 표 ─────────────────────────────────────────────────
ALTER TABLE "brokerage_cases" RENAME TO "projects";
ALTER TABLE "brokerage_case_steps" RENAME TO "project_steps";

-- ─── 2. 칸 ─────────────────────────────────────────────────
ALTER TABLE "project_steps" RENAME COLUMN "brokerage_case_id" TO "project_id";
ALTER TABLE "buyer_intakes" RENAME COLUMN "brokerage_case_id" TO "project_id";
ALTER TABLE "listing_intakes" RENAME COLUMN "brokerage_case_id" TO "project_id";

-- ─── 3. projects 의 제약과 색인 ─────────────────────────────
-- 기본 키·유일 제약은 제약 이름을 바꾸면 딸린 색인 이름도 함께 바뀐다.
ALTER TABLE "projects" RENAME CONSTRAINT "brokerage_cases_pkey" TO "projects_pkey";
ALTER TABLE "projects" RENAME CONSTRAINT "brokerage_cases_office_id_id_key" TO "projects_office_id_id_key";
ALTER TABLE "projects" RENAME CONSTRAINT "brokerage_cases_office_id_fkey" TO "projects_office_id_fkey";
ALTER INDEX "brokerage_cases_office_id_archived_at_created_at_idx" RENAME TO "projects_office_id_archived_at_created_at_idx";
ALTER INDEX "brokerage_cases_active_created_at_idx" RENAME TO "projects_active_created_at_idx";
ALTER INDEX "brokerage_cases_active_updated_at_idx" RENAME TO "projects_active_updated_at_idx";

-- ─── 4. project_steps 의 제약과 색인 ────────────────────────
ALTER TABLE "project_steps" RENAME CONSTRAINT "brokerage_case_steps_pkey" TO "project_steps_pkey";
ALTER TABLE "project_steps" RENAME CONSTRAINT "brokerage_case_steps_office_id_fkey" TO "project_steps_office_id_fkey";
ALTER TABLE "project_steps" RENAME CONSTRAINT "brokerage_case_steps_office_id_brokerage_case_id_fkey" TO "project_steps_office_id_project_id_fkey";
ALTER TABLE "project_steps" RENAME CONSTRAINT "brokerage_case_steps_office_id_brokerage_case_id_listing_i_fkey" TO "project_steps_office_id_project_id_listing_intake_id_fkey";
ALTER TABLE "project_steps" RENAME CONSTRAINT "brokerage_case_steps_office_id_brokerage_case_id_buyer_int_fkey" TO "project_steps_office_id_project_id_buyer_intake_id_fkey";
ALTER TABLE "project_steps" RENAME CONSTRAINT "brokerage_case_steps_deal_id_fkey" TO "project_steps_deal_id_fkey";
ALTER TABLE "project_steps" RENAME CONSTRAINT "brokerage_case_steps_one_target_check" TO "project_steps_one_target_check";
ALTER TABLE "project_steps" RENAME CONSTRAINT "brokerage_case_steps_manual_done_check" TO "project_steps_manual_done_check";
ALTER TABLE "project_steps" RENAME CONSTRAINT "brokerage_case_steps_sort_order_check" TO "project_steps_sort_order_check";
ALTER TABLE "project_steps" RENAME CONSTRAINT "brokerage_case_steps_title_check" TO "project_steps_title_check";
ALTER INDEX "brokerage_case_steps_office_id_brokerage_case_id_sort_order_idx" RENAME TO "project_steps_office_id_project_id_sort_order_idx";
ALTER INDEX "brokerage_case_steps_deal_id_idx" RENAME TO "project_steps_deal_id_idx";
ALTER INDEX "brokerage_case_steps_case_listing_intake_key" RENAME TO "project_steps_project_listing_intake_key";
ALTER INDEX "brokerage_case_steps_case_buyer_intake_key" RENAME TO "project_steps_project_buyer_intake_key";
ALTER INDEX "brokerage_case_steps_case_deal_key" RENAME TO "project_steps_project_deal_key";

-- ─── 5. 의뢰 두 표의 제약 ───────────────────────────────────
ALTER TABLE "buyer_intakes" RENAME CONSTRAINT "buyer_intakes_office_id_brokerage_case_id_fkey" TO "buyer_intakes_office_id_project_id_fkey";
ALTER TABLE "buyer_intakes" RENAME CONSTRAINT "buyer_intakes_office_id_brokerage_case_id_id_key" TO "buyer_intakes_office_id_project_id_id_key";
ALTER TABLE "listing_intakes" RENAME CONSTRAINT "listing_intakes_office_id_brokerage_case_id_fkey" TO "listing_intakes_office_id_project_id_fkey";
ALTER TABLE "listing_intakes" RENAME CONSTRAINT "listing_intakes_office_id_brokerage_case_id_id_key" TO "listing_intakes_office_id_project_id_id_key";
