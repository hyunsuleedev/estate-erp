ALTER TABLE "buyer_requirements"
  ADD COLUMN "monthly_rent_min" INTEGER;

COMMENT ON COLUMN "buyer_requirements"."monthly_rent_min"
  IS 'Minimum monthly rent accepted by the buyer, in 10,000 KRW units';
