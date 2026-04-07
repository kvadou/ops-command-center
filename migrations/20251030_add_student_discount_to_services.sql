-- Add student discount fields to Services table (camelCase columns)
-- Applies to all environments via existing migration tooling

ALTER TABLE public."Services"
    ADD COLUMN IF NOT EXISTS "studentDiscountEnabled" boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS "studentDiscountPercent" integer;

COMMENT ON COLUMN public."Services"."studentDiscountEnabled" IS 'If true, apply discount when additional students are added on booking form';
COMMENT ON COLUMN public."Services"."studentDiscountPercent" IS 'Percent discount to apply per student when 2+ students';


