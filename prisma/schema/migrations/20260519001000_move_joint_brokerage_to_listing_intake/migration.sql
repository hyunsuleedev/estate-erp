-- Move the joint-brokerage requirement from transaction option (Listing)
-- to request/intake level. Keep legacy Listing columns for compatibility.

ALTER TABLE "listing_intakes"
  ADD COLUMN "is_joint_brokerage_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "joint_brokerage_partner_id" UUID;

UPDATE "listing_intakes" i
SET
  "is_joint_brokerage_required" = x."is_joint_brokerage_required",
  "joint_brokerage_partner_id" = x."joint_brokerage_partner_id"
FROM (
  SELECT DISTINCT ON (l."intake_id")
    l."intake_id",
    true AS "is_joint_brokerage_required",
    l."joint_brokerage_partner_id"
  FROM "listings" l
  WHERE l."is_joint_brokerage_required" = true
  ORDER BY
    l."intake_id",
    (l."joint_brokerage_partner_id" IS NULL) ASC,
    l."updated_at" DESC
) x
WHERE i."id" = x."intake_id";

CREATE INDEX "listing_intakes_joint_brokerage_partner_id_idx"
  ON "listing_intakes"("joint_brokerage_partner_id");

ALTER TABLE "listing_intakes"
  ADD CONSTRAINT "listing_intakes_joint_brokerage_partner_id_fkey"
  FOREIGN KEY ("joint_brokerage_partner_id")
  REFERENCES "partner_brokers"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
