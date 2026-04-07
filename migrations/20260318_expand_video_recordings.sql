-- Expand video_recordings with metadata columns, create video_comments & video_views
-- For STC Capture (screen recording tool)

-- Add new columns to video_recordings
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_recordings' AND column_name = 'thumbnail_s3_key') THEN
    ALTER TABLE video_recordings ADD COLUMN thumbnail_s3_key VARCHAR(500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_recordings' AND column_name = 'recording_mode') THEN
    ALTER TABLE video_recordings ADD COLUMN recording_mode VARCHAR(20); -- screen_cam, screen, cam
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_recordings' AND column_name = 'layout') THEN
    ALTER TABLE video_recordings ADD COLUMN layout VARCHAR(20); -- bubble, presenter
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_recordings' AND column_name = 'access_level') THEN
    ALTER TABLE video_recordings ADD COLUMN access_level VARCHAR(20) DEFAULT 'anyone'; -- anyone, team, specific
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_recordings' AND column_name = 'allowed_users') THEN
    ALTER TABLE video_recordings ADD COLUMN allowed_users INTEGER[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_recordings' AND column_name = 'view_count') THEN
    ALTER TABLE video_recordings ADD COLUMN view_count INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_recordings' AND column_name = 'description') THEN
    ALTER TABLE video_recordings ADD COLUMN description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_recordings' AND column_name = 'tags') THEN
    ALTER TABLE video_recordings ADD COLUMN tags TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_recordings' AND column_name = 'category') THEN
    ALTER TABLE video_recordings ADD COLUMN category VARCHAR(50); -- operations, hr, marketing, etc.
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_recordings' AND column_name = 'deleted_at') THEN
    ALTER TABLE video_recordings ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Soft delete index
CREATE INDEX IF NOT EXISTS idx_video_recordings_deleted_at ON video_recordings(deleted_at) WHERE deleted_at IS NULL;

-- Video comments table
CREATE TABLE IF NOT EXISTS video_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES video_recordings(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  timestamp_seconds INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_comments_video_id ON video_comments(video_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_user_id ON video_comments(user_id);

-- Video views table
CREATE TABLE IF NOT EXISTS video_views (
  id SERIAL PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES video_recordings(id) ON DELETE CASCADE,
  viewer_ip VARCHAR(45),
  viewer_user_id INTEGER REFERENCES users(id),
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_views_video_id ON video_views(video_id);
CREATE INDEX IF NOT EXISTS idx_video_views_dedup ON video_views(video_id, viewer_ip, viewed_at);
