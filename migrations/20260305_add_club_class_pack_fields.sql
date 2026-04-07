-- Migration: Add club class pack fields to clients table
-- For the CCT Club tab: replaces Tutor with Class name, replaces Paid Schedule/Done with Class Pack toggle

ALTER TABLE clients ADD COLUMN IF NOT EXISTS has_class_pack BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS club_class_name TEXT;

-- Also add to client_conversion_tracking for historical consistency
ALTER TABLE client_conversion_tracking ADD COLUMN IF NOT EXISTS has_class_pack BOOLEAN DEFAULT FALSE;
ALTER TABLE client_conversion_tracking ADD COLUMN IF NOT EXISTS club_class_name TEXT;
