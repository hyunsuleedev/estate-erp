-- A Property can have one listing per transaction type:
-- sale + jeonse + monthly is valid, sale + sale is not.

WITH ranked_listings AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_number
  FROM listings
),
duplicate_listings AS (
  SELECT id AS old_id, keep_id
  FROM ranked_listings
  WHERE row_number > 1
)
DELETE FROM network_shared_properties nsp
USING duplicate_listings duplicate
WHERE nsp.listing_id = duplicate.old_id
  AND EXISTS (
    SELECT 1
    FROM network_shared_properties existing
    WHERE existing.room_id = nsp.room_id
      AND existing.listing_id = duplicate.keep_id
  );

WITH ranked_listings AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_number
  FROM listings
),
duplicate_listings AS (
  SELECT id AS old_id, keep_id
  FROM ranked_listings
  WHERE row_number > 1
)
UPDATE matches target
SET listing_id = duplicate.keep_id
FROM duplicate_listings duplicate
WHERE target.listing_id = duplicate.old_id;

WITH ranked_listings AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_number
  FROM listings
),
duplicate_listings AS (
  SELECT id AS old_id, keep_id
  FROM ranked_listings
  WHERE row_number > 1
)
UPDATE deals target
SET listing_id = duplicate.keep_id
FROM duplicate_listings duplicate
WHERE target.listing_id = duplicate.old_id;

WITH ranked_listings AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_number
  FROM listings
),
duplicate_listings AS (
  SELECT id AS old_id, keep_id
  FROM ranked_listings
  WHERE row_number > 1
)
UPDATE network_shared_properties target
SET listing_id = duplicate.keep_id
FROM duplicate_listings duplicate
WHERE target.listing_id = duplicate.old_id;

WITH ranked_listings AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_number
  FROM listings
),
duplicate_listings AS (
  SELECT id AS old_id, keep_id
  FROM ranked_listings
  WHERE row_number > 1
)
UPDATE price_histories target
SET listing_id = duplicate.keep_id
FROM duplicate_listings duplicate
WHERE target.listing_id = duplicate.old_id;

WITH ranked_listings AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_number
  FROM listings
),
duplicate_listings AS (
  SELECT id AS old_id, keep_id
  FROM ranked_listings
  WHERE row_number > 1
)
UPDATE tasks target
SET listing_id = duplicate.keep_id
FROM duplicate_listings duplicate
WHERE target.listing_id = duplicate.old_id;

WITH ranked_listings AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_number
  FROM listings
),
duplicate_listings AS (
  SELECT id AS old_id, keep_id
  FROM ranked_listings
  WHERE row_number > 1
)
UPDATE calendar_events target
SET listing_id = duplicate.keep_id
FROM duplicate_listings duplicate
WHERE target.listing_id = duplicate.old_id;

WITH ranked_listings AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_number
  FROM listings
),
duplicate_listings AS (
  SELECT id AS old_id, keep_id
  FROM ranked_listings
  WHERE row_number > 1
)
UPDATE consultations target
SET listing_id = duplicate.keep_id
FROM duplicate_listings duplicate
WHERE target.listing_id = duplicate.old_id;

WITH ranked_listings AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_number
  FROM listings
),
duplicate_listings AS (
  SELECT id AS old_id, keep_id
  FROM ranked_listings
  WHERE row_number > 1
)
UPDATE proposals target
SET listing_id = duplicate.keep_id
FROM duplicate_listings duplicate
WHERE target.listing_id = duplicate.old_id;

WITH ranked_listings AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_number
  FROM listings
),
duplicate_listings AS (
  SELECT id AS old_id, keep_id
  FROM ranked_listings
  WHERE row_number > 1
)
UPDATE entity_drafts target
SET listing_id = duplicate.keep_id
FROM duplicate_listings duplicate
WHERE target.listing_id = duplicate.old_id;

WITH ranked_listings AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, transaction_type
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_number
  FROM listings
),
duplicate_listings AS (
  SELECT id AS old_id
  FROM ranked_listings
  WHERE row_number > 1
)
DELETE FROM listings target
USING duplicate_listings duplicate
WHERE target.id = duplicate.old_id;

CREATE UNIQUE INDEX "listings_property_id_transaction_type_key"
  ON "listings"("property_id", "transaction_type");
