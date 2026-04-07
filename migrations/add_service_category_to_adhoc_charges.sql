-- Migration: Add service_category column to adhoc_charges table
-- Purpose: Enable COGS breakdown by service category (Home, Online, Retail, Schools, Other)
-- This allows monthly financial reports to reconcile pay type totals with category totals

-- Add the service_category column
ALTER TABLE adhoc_charges
ADD COLUMN IF NOT EXISTS service_category VARCHAR(50);

-- Create index for efficient category-based queries
CREATE INDEX IF NOT EXISTS idx_adhoc_charges_service_category
ON adhoc_charges(service_category)
WHERE service_category IS NOT NULL;

-- Add column comment
COMMENT ON COLUMN adhoc_charges.service_category IS 'Service category for COGS reporting: home, online, retail, schools, or other';

-- Backfill existing records based on inference rules:
-- 1. If appointment_id exists, try to infer from linked service labels
-- 2. Otherwise, try to infer from contractor's typical work patterns
-- 3. Default to 'other' for uncategorizable charges

-- Step 1: Update charges that have an appointment_id with Home-related services
UPDATE adhoc_charges ac
SET service_category = 'home'
WHERE service_category IS NULL
  AND appointment_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM appointments a
    JOIN services s ON a.service_id = s.service_id
    WHERE a.appointment_id = ac.appointment_id
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
        WHERE lbl.value ILIKE '%Home%'
      )
  );

-- Step 2: Update charges with Online services
UPDATE adhoc_charges ac
SET service_category = 'online'
WHERE service_category IS NULL
  AND appointment_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM appointments a
    JOIN services s ON a.service_id = s.service_id
    WHERE a.appointment_id = ac.appointment_id
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
        WHERE lbl.value ILIKE '%Online%'
      )
  );

-- Step 3: Update charges with School services
UPDATE adhoc_charges ac
SET service_category = 'schools'
WHERE service_category IS NULL
  AND appointment_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM appointments a
    JOIN services s ON a.service_id = s.service_id
    WHERE a.appointment_id = ac.appointment_id
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
        WHERE lbl.value ILIKE '%School%'
      )
  );

-- Step 4: Update charges with Club/Retail services (Clubs count as Retail)
UPDATE adhoc_charges ac
SET service_category = 'retail'
WHERE service_category IS NULL
  AND appointment_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM appointments a
    JOIN services s ON a.service_id = s.service_id
    WHERE a.appointment_id = ac.appointment_id
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
        WHERE lbl.value ILIKE '%Club%' OR lbl.value ILIKE '%Park Slope%' OR lbl.value ILIKE '%UES%'
      )
  );

-- Step 5: For charges without appointment_id, infer from contractor's primary work category
-- Based on their most common service type in the same month
UPDATE adhoc_charges ac
SET service_category = subq.inferred_category
FROM (
  SELECT
    ac2.id,
    CASE
      WHEN home_count >= online_count AND home_count >= school_count AND home_count >= retail_count THEN 'home'
      WHEN online_count >= home_count AND online_count >= school_count AND online_count >= retail_count THEN 'online'
      WHEN school_count >= home_count AND school_count >= online_count AND school_count >= retail_count THEN 'schools'
      WHEN retail_count >= home_count AND retail_count >= online_count AND retail_count >= school_count THEN 'retail'
      ELSE 'other'
    END as inferred_category
  FROM adhoc_charges ac2
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%Home%') THEN 1 ELSE 0 END), 0) as home_count,
      COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%Online%') THEN 1 ELSE 0 END), 0) as online_count,
      COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%School%') THEN 1 ELSE 0 END), 0) as school_count,
      COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%Club%' OR lbl.value ILIKE '%Park Slope%' OR lbl.value ILIKE '%UES%') THEN 1 ELSE 0 END), 0) as retail_count
    FROM appointment_contractors apc
    JOIN appointments a ON apc.appointment_id = a.appointment_id
    JOIN services s ON a.service_id = s.service_id
    WHERE apc.contractor_id = ac2.contractor_id
      AND a.status IN ('complete', 'cancelled-chargeable')
      AND DATE_TRUNC('month', a.start) = DATE_TRUNC('month', ac2.date_occurred)
  ) contractor_work ON true
  WHERE ac2.service_category IS NULL
    AND ac2.appointment_id IS NULL
    AND ac2.contractor_id IS NOT NULL
) subq
WHERE ac.id = subq.id
  AND ac.service_category IS NULL;

-- Step 6: Set remaining uncategorized charges to 'other'
UPDATE adhoc_charges
SET service_category = 'other'
WHERE service_category IS NULL;
