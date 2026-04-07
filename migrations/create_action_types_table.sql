-- Create action_types table for storing TutorCruncher action types
-- Action types define the types of activities/actions that can be performed in TutorCruncher

CREATE TABLE IF NOT EXISTS action_types (
  id INTEGER PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  machine_name VARCHAR(255),
  description TEXT,
  category VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  extra_attrs JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on action_key for faster lookups
CREATE INDEX IF NOT EXISTS idx_action_types_action_key ON action_types(action_key);

-- Create index on machine_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_action_types_machine_name ON action_types(machine_name);

-- Create index on category for filtering
CREATE INDEX IF NOT EXISTS idx_action_types_category ON action_types(category);

-- Create index on is_active for filtering active types
CREATE INDEX IF NOT EXISTS idx_action_types_is_active ON action_types(is_active);

