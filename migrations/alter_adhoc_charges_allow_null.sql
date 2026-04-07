-- Allow NULL values for net_gross column in adhoc_charges table
-- Some adhoc charges from the API don't have net_gross values

ALTER TABLE adhoc_charges 
ALTER COLUMN net_gross DROP NOT NULL;

ALTER TABLE adhoc_charges 
ALTER COLUMN pay_contractor DROP NOT NULL;

COMMENT ON COLUMN adhoc_charges.net_gross IS 'Can be NULL for some adhoc charges';
COMMENT ON COLUMN adhoc_charges.pay_contractor IS 'Can be NULL for some adhoc charges';

