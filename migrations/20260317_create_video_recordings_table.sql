-- Video recordings table for STC Studio screen recorder uploads
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS video_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255),
  s3_key VARCHAR(500),
  s3_bucket VARCHAR(100),
  duration_seconds INTEGER,
  file_size_bytes BIGINT,
  uploaded_by INTEGER REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'processing', -- processing | ready | error
  shareable_token VARCHAR(64) UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_recordings_token ON video_recordings(shareable_token);
CREATE INDEX IF NOT EXISTS idx_video_recordings_uploaded_by ON video_recordings(uploaded_by);
