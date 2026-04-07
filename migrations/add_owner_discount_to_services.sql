-- Add owner discount fields to Services table (camelCase columns)
-- Mirrors staff discount structure for school owner discounts (default 50%)

ALTER TABLE public."Services"
    ADD COLUMN IF NOT EXISTS "ownerDiscountEnabled" boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS "ownerDiscountPercentMonthly" integer DEFAULT 50,
    ADD COLUMN IF NOT EXISTS "ownerDiscountPercentTerm" integer DEFAULT 50;

COMMENT ON COLUMN public."Services"."ownerDiscountEnabled" IS 'If true, enable owner discount for this service';
COMMENT ON COLUMN public."Services"."ownerDiscountPercentMonthly" IS 'Percent discount to apply for owner bookings with monthly billing (default: 50)';
COMMENT ON COLUMN public."Services"."ownerDiscountPercentTerm" IS 'Percent discount to apply for owner bookings with term billing (default: 50)';
