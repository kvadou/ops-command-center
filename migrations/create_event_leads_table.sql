-- Create event_leads table for tracking event lead capture
CREATE TABLE IF NOT EXISTS event_leads (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL UNIQUE, -- TutorCruncher client ID
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    program_interest BOOLEAN DEFAULT FALSE,
    format_preference BOOLEAN DEFAULT FALSE,
    event_name VARCHAR(255),
    event_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_event_leads_client_id ON event_leads(client_id);
CREATE INDEX IF NOT EXISTS idx_event_leads_email ON event_leads(email);
CREATE INDEX IF NOT EXISTS idx_event_leads_event_name ON event_leads(event_name);
CREATE INDEX IF NOT EXISTS idx_event_leads_created_at ON event_leads(created_at);

-- Add comments for documentation
COMMENT ON TABLE event_leads IS 'Stores event lead capture data from school events and other lead generation activities';
COMMENT ON COLUMN event_leads.client_id IS 'TutorCruncher client ID - foreign key to clients table';
COMMENT ON COLUMN event_leads.program_interest IS 'Whether the lead is interested in chess programs';
COMMENT ON COLUMN event_leads.format_preference IS 'Whether the lead prefers in-person lessons';
COMMENT ON COLUMN event_leads.event_name IS 'Name of the event where the lead was captured';
COMMENT ON COLUMN event_leads.event_id IS 'Unique identifier for the specific event instance';
