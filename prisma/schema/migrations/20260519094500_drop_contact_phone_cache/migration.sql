-- Drop legacy Contact.phone cache. ContactPhone is the only phone source of truth.
DROP INDEX IF EXISTS "contacts_office_id_phone_key";
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "phone";
