-- Add enhanced client fields from TutorCruncher API
-- These fields will capture additional client information for better management

-- Add labels support (JSON array of label objects)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS labels JSONB;

-- Add photo URL
ALTER TABLE clients ADD COLUMN IF NOT EXISTS photo TEXT;

-- Add timezone
ALTER TABLE clients ADD COLUMN IF NOT EXISTS timezone TEXT;

-- Add received notifications (JSON array of notification types)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS received_notifications JSONB;

-- Add paid recipients (JSON array of student objects)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS paid_recipients JSONB;

-- Add extra attributes (JSON array of custom fields)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS extra_attrs JSONB;

-- Add associated agent information
ALTER TABLE clients ADD COLUMN IF NOT EXISTS associated_agent_id INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS associated_agent_name TEXT;

-- Add state column for US addresses
ALTER TABLE clients ADD COLUMN IF NOT EXISTS state VARCHAR(50);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_clients_labels ON clients USING GIN (labels);
CREATE INDEX IF NOT EXISTS idx_clients_paid_recipients ON clients USING GIN (paid_recipients);
CREATE INDEX IF NOT EXISTS idx_clients_extra_attrs ON clients USING GIN (extra_attrs);

-- Add comment for documentation
COMMENT ON COLUMN clients.labels IS 'Client labels from TutorCruncher for filtering and categorization';
COMMENT ON COLUMN clients.photo IS 'Client profile photo URL from TutorCruncher';
COMMENT ON COLUMN clients.timezone IS 'Client timezone for proper scheduling';
COMMENT ON COLUMN clients.received_notifications IS 'Client notification preferences from TutorCruncher';
COMMENT ON COLUMN clients.paid_recipients IS 'Students/recipients associated with this client';
COMMENT ON COLUMN clients.extra_attrs IS 'Custom client attributes from TutorCruncher';
