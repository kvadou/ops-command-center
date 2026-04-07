-- Add notes column to event_leads table
ALTER TABLE event_leads 
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- Add comment for documentation
COMMENT ON COLUMN event_leads.notes IS 'Additional notes or comments from the lead capture form';
