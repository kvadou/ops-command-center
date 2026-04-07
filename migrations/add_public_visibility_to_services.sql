-- Add public visibility field to Services table
-- This field controls whether a service appears on the public school directory

BEGIN;

-- Add public_visible field to Services table (camelCase to match existing schema)
ALTER TABLE "Services" 
ADD COLUMN IF NOT EXISTS "publicVisible" BOOLEAN DEFAULT false;

-- Add public_visible field to services table (lowercase to match raw TutorCruncher data)
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS public_visible BOOLEAN DEFAULT false;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_services_public_visible ON services (public_visible);
CREATE INDEX IF NOT EXISTS idx_Services_publicVisible ON "Services" ("publicVisible");

COMMIT;
