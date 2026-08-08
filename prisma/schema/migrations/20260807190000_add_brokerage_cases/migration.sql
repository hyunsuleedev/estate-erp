-- BrokerageCase is the customer-ledger aggregate. Every BuyerIntake and
-- ListingIntake belongs to exactly one case; each intake remains the source of
-- truth for its own lifecycle and business conditions.

CREATE TABLE "brokerage_cases" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "title" TEXT,
  "memo" TEXT,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brokerage_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "brokerage_cases_office_id_id_key" UNIQUE ("office_id", "id")
);

CREATE TABLE "brokerage_case_participants" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "brokerage_case_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_principal" BOOLEAN NOT NULL DEFAULT false,
  "is_communication_primary" BOOLEAN NOT NULL DEFAULT false,
  "memo" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brokerage_case_participants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "brokerage_case_participants_brokerage_case_id_contact_id_key"
    UNIQUE ("brokerage_case_id", "contact_id")
);

ALTER TABLE "buyer_intakes"
  ADD COLUMN "brokerage_case_id" UUID,
  ADD COLUMN "case_priority_rank" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "listing_intakes"
  ADD COLUMN "brokerage_case_id" UUID,
  ADD COLUMN "case_priority_rank" INTEGER NOT NULL DEFAULT 1;

-- Active intakes with the exact same set of actual principals are grouped.
-- Closed history and intakes without an identifiable principal are kept in
-- separate cases so a migration never invents a family/economic relationship.
CREATE TEMP TABLE "_brokerage_case_intake_candidates" ON COMMIT DROP AS
WITH buyer_subjects AS (
  SELECT
    'buyer'::TEXT AS "kind",
    bi."id" AS "intake_id",
    bi."office_id",
    bi."lifecycle_status",
    bi."received_at",
    bi."created_at",
    bi."updated_at",
    COALESCE(
      (
        SELECT string_agg(
          DISTINCT bic."contact_id"::TEXT,
          ',' ORDER BY bic."contact_id"::TEXT
        )
        FROM "buyer_intake_contacts" bic
        WHERE bic."buyer_intake_id" = bi."id"
          AND bic."role" IN ('buyer', 'co_buyer')
      ),
      (
        SELECT string_agg(
          DISTINCT bic."contact_id"::TEXT,
          ',' ORDER BY bic."contact_id"::TEXT
        )
        FROM "buyer_intake_contacts" bic
        WHERE bic."buyer_intake_id" = bi."id"
      )
    ) AS "subject_key"
  FROM "buyer_intakes" bi
), listing_subjects AS (
  SELECT
    'listing'::TEXT AS "kind",
    li."id" AS "intake_id",
    li."office_id",
    li."lifecycle_status",
    li."received_at",
    li."created_at",
    li."updated_at",
    COALESCE(
      (
        SELECT string_agg(
          DISTINCT pc."contact_id"::TEXT,
          ',' ORDER BY pc."contact_id"::TEXT
        )
        FROM "property_contacts" pc
        WHERE pc."property_id" = li."property_id"
          AND pc."office_id" = li."office_id"
          AND pc."status" = 'active'
          AND pc."role" IN ('owner', 'co_owner')
      ),
      (
        SELECT string_agg(
          DISTINCT pc."contact_id"::TEXT,
          ',' ORDER BY pc."contact_id"::TEXT
        )
        FROM "property_contacts" pc
        WHERE pc."property_id" = li."property_id"
          AND pc."office_id" = li."office_id"
          AND pc."status" = 'active'
          AND pc."is_primary" = true
      ),
      (
        SELECT string_agg(
          DISTINCT pc."contact_id"::TEXT,
          ',' ORDER BY pc."contact_id"::TEXT
        )
        FROM "property_contacts" pc
        WHERE pc."property_id" = li."property_id"
          AND pc."office_id" = li."office_id"
          AND pc."status" = 'active'
      )
    ) AS "subject_key"
  FROM "listing_intakes" li
), all_intakes AS (
  SELECT * FROM buyer_subjects
  UNION ALL
  SELECT * FROM listing_subjects
)
SELECT
  i.*,
  CASE
    WHEN i."lifecycle_status" IN ('open', 'hold')
      AND i."subject_key" IS NOT NULL
      THEN 'active-subject:' || i."subject_key"
    ELSE i."kind" || '-intake:' || i."intake_id"::TEXT
  END AS "group_key"
FROM all_intakes i;

CREATE TEMP TABLE "_brokerage_case_groups" ON COMMIT DROP AS
SELECT
  c."office_id",
  c."group_key",
  gen_random_uuid() AS "case_id",
  MIN(c."created_at") AS "created_at",
  MAX(c."updated_at") AS "updated_at"
FROM "_brokerage_case_intake_candidates" c
GROUP BY c."office_id", c."group_key";

INSERT INTO "brokerage_cases" (
  "id",
  "office_id",
  "title",
  "memo",
  "archived_at",
  "created_at",
  "updated_at"
)
SELECT
  g."case_id",
  g."office_id",
  NULL,
  NULL,
  NULL,
  g."created_at",
  g."updated_at"
FROM "_brokerage_case_groups" g;

UPDATE "buyer_intakes" bi
SET "brokerage_case_id" = g."case_id"
FROM "_brokerage_case_intake_candidates" c
JOIN "_brokerage_case_groups" g
  ON g."office_id" = c."office_id"
 AND g."group_key" = c."group_key"
WHERE c."kind" = 'buyer'
  AND bi."id" = c."intake_id";

UPDATE "listing_intakes" li
SET "brokerage_case_id" = g."case_id"
FROM "_brokerage_case_intake_candidates" c
JOIN "_brokerage_case_groups" g
  ON g."office_id" = c."office_id"
 AND g."group_key" = c."group_key"
WHERE c."kind" = 'listing'
  AND li."id" = c."intake_id";

WITH ranked AS (
  SELECT
    bi."id",
    ROW_NUMBER() OVER (
      PARTITION BY bi."brokerage_case_id"
      ORDER BY bi."received_at" ASC, bi."created_at" ASC, bi."id" ASC
    )::INTEGER AS "priority_rank"
  FROM "buyer_intakes" bi
)
UPDATE "buyer_intakes" bi
SET "case_priority_rank" = ranked."priority_rank"
FROM ranked
WHERE ranked."id" = bi."id";

WITH ranked AS (
  SELECT
    li."id",
    ROW_NUMBER() OVER (
      PARTITION BY li."brokerage_case_id"
      ORDER BY li."received_at" ASC, li."created_at" ASC, li."id" ASC
    )::INTEGER AS "priority_rank"
  FROM "listing_intakes" li
)
UPDATE "listing_intakes" li
SET "case_priority_rank" = ranked."priority_rank"
FROM ranked
WHERE ranked."id" = li."id";

-- CaseParticipant is a case-wide directory. Intake/property-specific roles
-- remain in BuyerIntakeContact and PropertyContact respectively.
WITH participant_roles AS (
  SELECT
    bic."office_id",
    bi."brokerage_case_id",
    bic."contact_id",
    bic."role",
    bic."role" IN ('buyer', 'co_buyer') AS "is_principal",
    bic."created_at",
    bic."updated_at"
  FROM "buyer_intake_contacts" bic
  JOIN "buyer_intakes" bi ON bi."id" = bic."buyer_intake_id"

  UNION ALL

  SELECT
    pc."office_id",
    li."brokerage_case_id",
    pc."contact_id",
    CASE pc."role"
      WHEN 'owner' THEN 'seller'
      WHEN 'co_owner' THEN 'co_seller'
      ELSE pc."role"
    END AS "role",
    pc."role" IN ('owner', 'co_owner') AS "is_principal",
    pc."created_at",
    pc."updated_at"
  FROM "listing_intakes" li
  JOIN "property_contacts" pc
    ON pc."office_id" = li."office_id"
   AND pc."property_id" = li."property_id"
   AND pc."status" = 'active'
), grouped_participants AS (
  SELECT
    pr."office_id",
    pr."brokerage_case_id",
    pr."contact_id",
    ARRAY_AGG(DISTINCT pr."role" ORDER BY pr."role") AS "roles",
    BOOL_OR(pr."is_principal") AS "is_principal",
    MIN(pr."created_at") AS "created_at",
    MAX(pr."updated_at") AS "updated_at"
  FROM participant_roles pr
  GROUP BY pr."office_id", pr."brokerage_case_id", pr."contact_id"
)
INSERT INTO "brokerage_case_participants" (
  "id",
  "office_id",
  "brokerage_case_id",
  "contact_id",
  "roles",
  "is_principal",
  "is_communication_primary",
  "memo",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  gp."office_id",
  gp."brokerage_case_id",
  gp."contact_id",
  gp."roles",
  gp."is_principal",
  false,
  NULL,
  gp."created_at",
  gp."updated_at"
FROM grouped_participants gp;

-- At most one case-level communication contact. Prefer an intake/property
-- primary, then an actual principal, then the oldest participant.
WITH ranked AS (
  SELECT
    bcp."id",
    ROW_NUMBER() OVER (
      PARTITION BY bcp."brokerage_case_id"
      ORDER BY
        CASE WHEN EXISTS (
          SELECT 1
          FROM "buyer_intakes" bi
          JOIN "buyer_intake_contacts" bic
            ON bic."buyer_intake_id" = bi."id"
           AND bic."contact_id" = bcp."contact_id"
           AND bic."is_primary" = true
          WHERE bi."brokerage_case_id" = bcp."brokerage_case_id"
        ) OR EXISTS (
          SELECT 1
          FROM "listing_intakes" li
          JOIN "property_contacts" pc
            ON pc."office_id" = li."office_id"
           AND pc."property_id" = li."property_id"
           AND pc."contact_id" = bcp."contact_id"
           AND pc."status" = 'active'
           AND pc."is_primary" = true
          WHERE li."brokerage_case_id" = bcp."brokerage_case_id"
        ) THEN 0 ELSE 1 END,
        bcp."is_principal" DESC,
        bcp."created_at" ASC,
        bcp."id" ASC
    ) AS rn
  FROM "brokerage_case_participants" bcp
)
UPDATE "brokerage_case_participants" bcp
SET "is_communication_primary" = true
FROM ranked
WHERE ranked."id" = bcp."id"
  AND ranked.rn = 1;

ALTER TABLE "buyer_intakes"
  ALTER COLUMN "brokerage_case_id" SET NOT NULL,
  ADD CONSTRAINT "buyer_intakes_case_priority_rank_check"
    CHECK ("case_priority_rank" >= 1),
  ADD CONSTRAINT "buyer_intakes_office_id_brokerage_case_id_id_key"
    UNIQUE ("office_id", "brokerage_case_id", "id");

ALTER TABLE "listing_intakes"
  ALTER COLUMN "brokerage_case_id" SET NOT NULL,
  ADD CONSTRAINT "listing_intakes_case_priority_rank_check"
    CHECK ("case_priority_rank" >= 1),
  ADD CONSTRAINT "listing_intakes_office_id_id_key"
    UNIQUE ("office_id", "id"),
  ADD CONSTRAINT "listing_intakes_office_id_brokerage_case_id_id_key"
    UNIQUE ("office_id", "brokerage_case_id", "id");

CREATE TABLE "brokerage_case_dependencies" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "brokerage_case_id" UUID NOT NULL,
  "from_listing_intake_id" UUID NOT NULL,
  "to_buyer_intake_id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "expected_amount" INTEGER,
  "required_by" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'planned',
  "memo" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brokerage_case_dependencies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "brokerage_case_dependencies_status_check"
    CHECK ("status" IN ('planned', 'confirmed', 'resolved', 'cancelled')),
  CONSTRAINT "brokerage_case_dependencies_type_check"
    CHECK ("type" IN ('sale_proceeds', 'timing', 'move_sequence', 'other')),
  CONSTRAINT "brokerage_case_dependencies_expected_amount_check"
    CHECK ("expected_amount" IS NULL OR "expected_amount" >= 0),
  CONSTRAINT "brokerage_case_dependencies_unique_link"
    UNIQUE (
      "brokerage_case_id",
      "from_listing_intake_id",
      "to_buyer_intake_id",
      "type"
    )
);

CREATE INDEX "brokerage_cases_office_id_archived_at_updated_at_idx"
  ON "brokerage_cases" ("office_id", "archived_at", "updated_at");
CREATE INDEX "brokerage_cases_active_updated_at_idx"
  ON "brokerage_cases" ("office_id", "updated_at" DESC, "id")
  WHERE "archived_at" IS NULL;

CREATE INDEX "brokerage_case_participants_office_id_contact_id_case_id_idx"
  ON "brokerage_case_participants" (
    "office_id",
    "contact_id",
    "brokerage_case_id"
  );
CREATE INDEX "brokerage_case_participants_office_id_case_id_principal_idx"
  ON "brokerage_case_participants" (
    "office_id",
    "brokerage_case_id",
    "is_principal"
  );
CREATE UNIQUE INDEX "brokerage_case_participants_one_communication_primary"
  ON "brokerage_case_participants" ("brokerage_case_id")
  WHERE "is_communication_primary" = true;

CREATE INDEX "buyer_intakes_office_id_case_id_lifecycle_priority_idx"
  ON "buyer_intakes" (
    "office_id",
    "brokerage_case_id",
    "lifecycle_status",
    "case_priority_rank"
  );
CREATE INDEX "listing_intakes_office_id_case_id_lifecycle_priority_idx"
  ON "listing_intakes" (
    "office_id",
    "brokerage_case_id",
    "lifecycle_status",
    "case_priority_rank"
  );
CREATE INDEX "buyer_requirements_intake_status_priority_idx"
  ON "buyer_requirements" ("buyer_intake_id", "status", "priority_rank");

CREATE INDEX "brokerage_case_dependencies_office_id_case_id_idx"
  ON "brokerage_case_dependencies" ("office_id", "brokerage_case_id");
CREATE INDEX "brokerage_case_dependencies_from_listing_intake_id_idx"
  ON "brokerage_case_dependencies" ("from_listing_intake_id");
CREATE INDEX "brokerage_case_dependencies_to_buyer_intake_id_idx"
  ON "brokerage_case_dependencies" ("to_buyer_intake_id");

ALTER TABLE "brokerage_cases"
  ADD CONSTRAINT "brokerage_cases_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "brokerage_case_participants"
  ADD CONSTRAINT "brokerage_case_participants_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "brokerage_case_participants_office_id_case_id_fkey"
  FOREIGN KEY ("office_id", "brokerage_case_id")
  REFERENCES "brokerage_cases"("office_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "brokerage_case_participants_office_id_contact_id_fkey"
  FOREIGN KEY ("office_id", "contact_id")
  REFERENCES "contacts"("office_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "buyer_intakes"
  ADD CONSTRAINT "buyer_intakes_office_id_brokerage_case_id_fkey"
  FOREIGN KEY ("office_id", "brokerage_case_id")
  REFERENCES "brokerage_cases"("office_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_intakes"
  ADD CONSTRAINT "listing_intakes_office_id_brokerage_case_id_fkey"
  FOREIGN KEY ("office_id", "brokerage_case_id")
  REFERENCES "brokerage_cases"("office_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "brokerage_case_dependencies"
  ADD CONSTRAINT "brokerage_case_dependencies_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "brokerage_case_dependencies_office_id_case_id_fkey"
  FOREIGN KEY ("office_id", "brokerage_case_id")
  REFERENCES "brokerage_cases"("office_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "brokerage_case_dependencies_source_intake_fkey"
  FOREIGN KEY (
    "office_id",
    "brokerage_case_id",
    "from_listing_intake_id"
  ) REFERENCES "listing_intakes"(
    "office_id",
    "brokerage_case_id",
    "id"
  ) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "brokerage_case_dependencies_target_intake_fkey"
  FOREIGN KEY (
    "office_id",
    "brokerage_case_id",
    "to_buyer_intake_id"
  ) REFERENCES "buyer_intakes"(
    "office_id",
    "brokerage_case_id",
    "id"
  ) ON DELETE RESTRICT ON UPDATE CASCADE;
