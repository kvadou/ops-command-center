-- Task Attachments Table
-- Stores file attachments for task items
-- Supports both database storage (small files) and Cloudinary (large files)

CREATE TABLE IF NOT EXISTS task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  uploader_id TEXT NOT NULL, -- user id or email
  
  -- File metadata
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_size BIGINT NOT NULL, -- in bytes
  mime_type TEXT NOT NULL,
  
  -- Storage location
  storage_type TEXT NOT NULL CHECK (storage_type IN ('database', 'cloudinary')),
  file_data BYTEA, -- for small files stored in database
  cloudinary_public_id TEXT, -- for files stored in Cloudinary
  cloudinary_url TEXT, -- full Cloudinary URL
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT valid_storage CHECK (
    (storage_type = 'database' AND file_data IS NOT NULL AND cloudinary_public_id IS NULL) OR
    (storage_type = 'cloudinary' AND file_data IS NULL AND cloudinary_public_id IS NOT NULL)
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_attachments_item_id ON task_attachments(item_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_attachments_uploader_id ON task_attachments(uploader_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_attachments_created_at ON task_attachments(created_at DESC);

-- Comments
COMMENT ON TABLE task_attachments IS 'File attachments for task items, supporting both database and Cloudinary storage';
COMMENT ON COLUMN task_attachments.storage_type IS 'Storage location: database for files < 1MB, cloudinary for larger files';
COMMENT ON COLUMN task_attachments.file_data IS 'Binary file data for small files stored in database';
COMMENT ON COLUMN task_attachments.cloudinary_public_id IS 'Cloudinary public ID for large files';

