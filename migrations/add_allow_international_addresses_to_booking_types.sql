ALTER TABLE booking_types
ADD COLUMN IF NOT EXISTS allow_international_addresses BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN booking_types.allow_international_addresses IS 'Enables country-first, international-friendly address entry on the public booking form.';

UPDATE booking_types
SET allow_international_addresses = true
WHERE id IN (1057, 24);
