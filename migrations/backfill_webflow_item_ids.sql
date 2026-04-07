-- Backfill webflow_item_id for 8 tutors manually created in Webflow CMS
-- These IDs link OpsHub contractors to their existing Webflow CMS items
-- to prevent duplicate creation during sync.
-- Run: Production only (acme-ops-main)

UPDATE contractors SET webflow_item_id = '69b41eaa5bed889e25aaa1da' WHERE contractor_id = 2831122; -- Ana
UPDATE contractors SET webflow_item_id = '69b41eaa5bed889e25aaa1d7' WHERE contractor_id = 4290450; -- L'Oreal
UPDATE contractors SET webflow_item_id = '69b41eaa5bed889e25aaa1d4' WHERE contractor_id = 4381267; -- Molly
UPDATE contractors SET webflow_item_id = '69b41eaa5bed889e25aaa1d1' WHERE contractor_id = 4316892; -- Seth
UPDATE contractors SET webflow_item_id = '69b41eaa5bed889e25aaa1ce' WHERE contractor_id = 3204984; -- Parker
UPDATE contractors SET webflow_item_id = '69b41eaa5bed889e25aaa1cb' WHERE contractor_id = 3953721; -- Leila
UPDATE contractors SET webflow_item_id = '69b41eaa5bed889e25aaa1c8' WHERE contractor_id = 3168303; -- Alessandro
UPDATE contractors SET webflow_item_id = '69b41eaa5bed889e25aaa1c5' WHERE contractor_id = 4804213; -- Chelsey
