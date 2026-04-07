-- Add missing fields from TutorCruncher API response to adhoc_charges table
-- Based on API response structure: GET /api/adhoccharges/{id}/

-- Add missing numeric fields
ALTER TABLE adhoc_charges 
ADD COLUMN IF NOT EXISTS charge_client_forex NUMERIC,
ADD COLUMN IF NOT EXISTS client_cost NUMERIC,
ADD COLUMN IF NOT EXISTS currency_conversion NUMERIC;

-- Add missing role type fields
ALTER TABLE adhoc_charges 
ADD COLUMN IF NOT EXISTS contractor_role_type TEXT,
ADD COLUMN IF NOT EXISTS creator_role_type TEXT;

-- Add category URL field
ALTER TABLE adhoc_charges 
ADD COLUMN IF NOT EXISTS category_url TEXT;

-- Add arrays for invoices and payment orders (stored as JSONB)
ALTER TABLE adhoc_charges 
ADD COLUMN IF NOT EXISTS invoices JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS payment_orders JSONB DEFAULT '[]'::jsonb;

-- Add indexes for new fields that might be queried
CREATE INDEX IF NOT EXISTS idx_adhoc_charges_client_cost ON adhoc_charges(client_cost) WHERE client_cost IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_adhoc_charges_contractor_role_type ON adhoc_charges(contractor_role_type) WHERE contractor_role_type IS NOT NULL;

-- Add comments
COMMENT ON COLUMN adhoc_charges.charge_client_forex IS 'Client charge amount in foreign currency';
COMMENT ON COLUMN adhoc_charges.client_cost IS 'Cost to the client';
COMMENT ON COLUMN adhoc_charges.currency_conversion IS 'Currency conversion rate or amount';
COMMENT ON COLUMN adhoc_charges.contractor_role_type IS 'Role type of contractor (e.g., "Tutor")';
COMMENT ON COLUMN adhoc_charges.creator_role_type IS 'Role type of creator (e.g., "Administrator")';
COMMENT ON COLUMN adhoc_charges.category_url IS 'URL to category API endpoint';
COMMENT ON COLUMN adhoc_charges.invoices IS 'Array of associated invoice IDs/objects';
COMMENT ON COLUMN adhoc_charges.payment_orders IS 'Array of associated payment order IDs/objects';


