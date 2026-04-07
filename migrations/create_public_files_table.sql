-- Create public_files table for storing public uploads
-- These files are publicly accessible and can be used in emails, PDFs, and custom site theming

CREATE TABLE IF NOT EXISTS public_files (
    id SERIAL PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    file_type VARCHAR(100),
    mime_type VARCHAR(100),
    uploader_id INTEGER, -- User ID who uploaded the file
    uploader_name VARCHAR(255), -- Name of the uploader (for display)
    date_uploaded TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_files_date_uploaded ON public_files(date_uploaded);
CREATE INDEX IF NOT EXISTS idx_public_files_uploader_id ON public_files(uploader_id);
CREATE INDEX IF NOT EXISTS idx_public_files_file_type ON public_files(file_type);

COMMENT ON TABLE public_files IS 'Stores metadata for publicly accessible files (images, PDFs, etc.) used in emails and site theming';
COMMENT ON COLUMN public_files.file_name IS 'Stored filename (with unique suffix)';
COMMENT ON COLUMN public_files.original_name IS 'Original filename as uploaded by user';
COMMENT ON COLUMN public_files.file_path IS 'Relative path to the file from uploads directory';
COMMENT ON COLUMN public_files.file_size IS 'File size in bytes';
COMMENT ON COLUMN public_files.file_type IS 'File type/category (image, pdf, etc.)';
COMMENT ON COLUMN public_files.mime_type IS 'MIME type of the file';
COMMENT ON COLUMN public_files.uploader_id IS 'ID of the user who uploaded the file';
COMMENT ON COLUMN public_files.uploader_name IS 'Name of the uploader for display purposes';

