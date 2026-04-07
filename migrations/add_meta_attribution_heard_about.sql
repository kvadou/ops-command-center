-- Migration: Add Meta Ads Attribution via heard_about Field
-- Date: 2025-11-XX
-- Description: This migration documents the change to include submissions with heard_about = 'Facebook' or 'Instagram'
--              in Meta Ads Performance KPIs, in addition to existing UTM-based attribution.
--              No data migration is needed - the heard_about field already exists and contains the data.
--              This is a query/logic change only.

-- Verification query: Check how many submissions will now be attributed to Meta ads
-- via the heard_about field (that weren't previously attributed via UTM)
DO $$
DECLARE
  v_heard_about_count INTEGER;
  v_utm_only_count INTEGER;
  v_both_count INTEGER;
  v_total_meta_attributed INTEGER;
BEGIN
  -- Count submissions with heard_about = Facebook/Instagram but no UTM attribution
  SELECT COUNT(*) INTO v_heard_about_count
  FROM booking_submissions
  WHERE LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram')
    AND NOT (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' 
             AND COALESCE(utm->>'utm_campaign', '') != '')
    AND payment_status IN ('paid', 'verified')
    AND tc_client_id IS NOT NULL;
  
  -- Count submissions with UTM attribution only (no heard_about)
  SELECT COUNT(*) INTO v_utm_only_count
  FROM booking_submissions
  WHERE (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' 
         AND COALESCE(utm->>'utm_campaign', '') != '')
    AND NOT (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
    AND payment_status IN ('paid', 'verified')
    AND tc_client_id IS NOT NULL;
  
  -- Count submissions with both UTM and heard_about attribution
  SELECT COUNT(*) INTO v_both_count
  FROM booking_submissions
  WHERE (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' 
         AND COALESCE(utm->>'utm_campaign', '') != '')
    AND LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram')
    AND payment_status IN ('paid', 'verified')
    AND tc_client_id IS NOT NULL;
  
  -- Total Meta-attributed submissions (new logic)
  SELECT COUNT(*) INTO v_total_meta_attributed
  FROM booking_submissions
  WHERE (
    (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' 
     AND COALESCE(utm->>'utm_campaign', '') != '')
    OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
  )
    AND payment_status IN ('paid', 'verified')
    AND tc_client_id IS NOT NULL;
  
  -- Log the results
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Meta Attribution Migration Summary';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Submissions attributed via heard_about only: %', v_heard_about_count;
  RAISE NOTICE 'Submissions attributed via UTM only: %', v_utm_only_count;
  RAISE NOTICE 'Submissions attributed via BOTH: %', v_both_count;
  RAISE NOTICE 'Total Meta-attributed submissions (new): %', v_total_meta_attributed;
  RAISE NOTICE 'Total Meta-attributed submissions (old, UTM only): %', (v_utm_only_count + v_both_count);
  RAISE NOTICE 'New submissions being attributed: %', v_heard_about_count;
  RAISE NOTICE '========================================';
END $$;

-- Create a view for easy reference (optional)
CREATE OR REPLACE VIEW meta_attributed_submissions AS
SELECT 
  bs.id,
  bs.created_at,
  bs.parent_first,
  bs.parent_last,
  bs.parent_email,
  bs.booking_type,
  bs.label_name,
  bs.heard_about,
  bs.utm->>'utm_source' AS utm_source,
  bs.utm->>'utm_campaign' AS utm_campaign,
  bs.payment_status,
  bs.tc_client_id,
  CASE 
    WHEN LOWER(COALESCE(bs.utm->>'utm_source', '')) = 'facebook' 
         AND COALESCE(bs.utm->>'utm_campaign', '') != '' 
    THEN 'utm'
    WHEN LOWER(COALESCE(bs.heard_about, '')) IN ('facebook', 'instagram')
    THEN 'heard_about'
    ELSE 'unknown'
  END AS attribution_source
FROM booking_submissions bs
WHERE (
  (LOWER(COALESCE(bs.utm->>'utm_source', '')) = 'facebook' 
   AND COALESCE(bs.utm->>'utm_campaign', '') != '')
  OR (LOWER(COALESCE(bs.heard_about, '')) IN ('facebook', 'instagram'))
)
  AND bs.payment_status IN ('paid', 'verified')
  AND bs.tc_client_id IS NOT NULL;

COMMENT ON VIEW meta_attributed_submissions IS 
'View showing all booking submissions attributed to Meta ads, including both UTM-based and heard_about field attribution. Updated 2025-11-XX to include heard_about field.';

