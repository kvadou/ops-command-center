-- Add local_image_url column to contractors table
-- This stores the URL of profile photos uploaded directly to our system

DO $$
BEGIN
  -- Check if column already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'contractors' 
    AND column_name = 'local_image_url'
  ) THEN
    ALTER TABLE contractors 
    ADD COLUMN local_image_url TEXT;
    
    CREATE INDEX IF NOT EXISTS idx_contractors_local_image_url 
    ON contractors(local_image_url) 
    WHERE local_image_url IS NOT NULL;
    
    COMMENT ON COLUMN contractors.local_image_url IS 'URL of profile photo uploaded to our system (Cloudinary)';
  END IF;
END $$;

