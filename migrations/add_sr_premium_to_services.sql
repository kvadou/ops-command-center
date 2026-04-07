-- Add sr_premium to services
ALTER TABLE "Services"
ADD COLUMN IF NOT EXISTS sr_premium numeric(10,2);


