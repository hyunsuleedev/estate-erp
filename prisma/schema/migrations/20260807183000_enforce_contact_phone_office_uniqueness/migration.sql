-- 같은 사무소 안에서 하나의 canonical 전화번호는 하나의 ContactPhone만 소유한다.
-- 중복 연락처를 임의 병합하면 연결 데이터가 손실될 수 있으므로, 중복이 있으면 명시적으로 실패한다.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "contact_phones"
    GROUP BY "office_id", "phone"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'contact_phones contains duplicate phone ownership within an office; merge contacts before migrating';
  END IF;
END $$;

DROP INDEX "contact_phones_office_id_contact_id_phone_key";
DROP INDEX "contact_phones_office_id_phone_idx";

CREATE UNIQUE INDEX "contact_phones_office_id_phone_key"
  ON "contact_phones" ("office_id", "phone");
