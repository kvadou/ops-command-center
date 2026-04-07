-- Add staff discount fields to Services table (camelCase columns)
-- Applies to all environments via existing migration tooling

ALTER TABLE public."Services"
    ADD COLUMN IF NOT EXISTS "staffDiscountEnabled" boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS "staffDiscountPercentMonthly" integer DEFAULT 20,
    ADD COLUMN IF NOT EXISTS "staffDiscountPercentTerm" integer DEFAULT 20;

COMMENT ON COLUMN public."Services"."staffDiscountEnabled" IS 'If true, enable staff discount for this service';
COMMENT ON COLUMN public."Services"."staffDiscountPercentMonthly" IS 'Percent discount to apply for staff bookings with monthly billing (default: 20)';
COMMENT ON COLUMN public."Services"."staffDiscountPercentTerm" IS 'Percent discount to apply for staff bookings with term billing (default: 20)';



