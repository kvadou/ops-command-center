-- Add archived field to Services table
-- This allows services to be archived instead of deleted

BEGIN;

-- Add archived field to Services table (camelCase to match existing schema)
ALTER TABLE "Services" 
ADD COLUMN IF NOT EXISTS "archived" BOOLEAN DEFAULT false;

-- Add archived field to services table (lowercase to match raw TutorCruncher data)
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_services_archived ON services (archived);
CREATE INDEX IF NOT EXISTS idx_Services_archived ON "Services" ("archived");

-- Add archivedAt timestamp for when the service was archived
ALTER TABLE "Services" 
ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP WITH TIME ZONE;

ALTER TABLE services 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

COMMIT;

