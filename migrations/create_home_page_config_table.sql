-- Create home_page_config table for storing user's customizable home page layouts
-- Each user can have their own custom layout configuration

CREATE TABLE IF NOT EXISTS home_page_config (
  id SERIAL PRIMARY KEY,
  
  -- User identification
  user_id INTEGER NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  
  -- Layout configuration
  layout_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Structure: [
  --   {
  --     "id": "quick-access",
  --     "type": "quick-access",
  --     "x": 0,
  --     "y": 0,
  --     "w": 12,
  --     "h": 2,
  --     "visible": true
  --   },
  --   {
  --     "id": "news-feed",
  --     "type": "news-feed",
  --     "x": 0,
  --     "y": 2,
  --     "w": 12,
  --     "h": 4,
  --     "visible": true
  --   },
  --   {
  --     "id": "tasks",
  --     "type": "tasks",
  --     "x": 0,
  --     "y": 6,
  --     "w": 6,
  --     "h": 4,
  --     "visible": true
  --   },
  --   {
  --     "id": "upcoming-lessons",
  --     "type": "upcoming-lessons",
  --     "x": 6,
  --     "y": 6,
  --     "w": 6,
  --     "h": 4,
  --     "visible": true
  --   },
  --   {
  --     "id": "activity-feed",
  --     "type": "activity-feed",
  --     "x": 0,
  --     "y": 10,
  --     "w": 12,
  --     "h": 3,
  --     "visible": true
  --   },
  --   {
  --     "id": "analytics",
  --     "type": "analytics",
  --     "x": 0,
  --     "y": 13,
  --     "w": 12,
  --     "h": 2,
  --     "visible": true
  --   }
  -- ]
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique constraint: one config per user
  CONSTRAINT unique_user_config UNIQUE (user_id, user_email)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_home_page_config_user ON home_page_config(user_id, user_email);
