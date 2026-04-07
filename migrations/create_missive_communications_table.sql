-- Migration: Create Missive Communications Table
-- This table stores email communications received via Missive webhooks

CREATE TABLE IF NOT EXISTS missive_communications (
    id SERIAL PRIMARY KEY,
    missive_conversation_id VARCHAR(255) NOT NULL,
    missive_message_id VARCHAR(255),
    rule_id VARCHAR(255),
    rule_type VARCHAR(100), -- incoming_email, new_comment, etc.
    
    -- Conversation data
    conversation_subject TEXT,
    conversation_organization_id VARCHAR(255),
    conversation_organization_name VARCHAR(255),
    conversation_team_id VARCHAR(255),
    conversation_team_name VARCHAR(255),
    
    -- Message/Comment data
    message_type VARCHAR(50), -- email, sms, comment, etc.
    message_subject TEXT,
    message_preview TEXT,
    message_delivered_at TIMESTAMP WITH TIME ZONE,
    message_created_at TIMESTAMP WITH TIME ZONE,
    message_updated_at TIMESTAMP WITH TIME ZONE,
    email_message_id VARCHAR(500), -- Email Message-ID header
    
    -- Comment-specific data
    comment_text TEXT, -- Full comment text (for comments)
    comment_author VARCHAR(255), -- Comment author name/email
    
    -- Participants
    from_name VARCHAR(255),
    from_address VARCHAR(255),
    to_addresses TEXT[], -- Array of email addresses
    cc_addresses TEXT[],
    bcc_addresses TEXT[],
    
    -- Client matching
    client_email VARCHAR(255), -- Matched client email
    client_id INTEGER, -- Matched client ID from clients table
    
    -- Raw webhook data
    webhook_data JSONB,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_missive_communications_conversation_id ON missive_communications(missive_conversation_id);
CREATE INDEX IF NOT EXISTS idx_missive_communications_message_id ON missive_communications(missive_message_id);
CREATE INDEX IF NOT EXISTS idx_missive_communications_client_email ON missive_communications(client_email);
CREATE INDEX IF NOT EXISTS idx_missive_communications_client_id ON missive_communications(client_id);
CREATE INDEX IF NOT EXISTS idx_missive_communications_from_address ON missive_communications(from_address);
CREATE INDEX IF NOT EXISTS idx_missive_communications_message_created_at ON missive_communications(message_created_at);
CREATE INDEX IF NOT EXISTS idx_missive_communications_rule_type ON missive_communications(rule_type);

-- Unique constraint to prevent duplicate webhook processing
CREATE UNIQUE INDEX IF NOT EXISTS idx_missive_communications_unique_message 
    ON missive_communications(missive_conversation_id, missive_message_id) 
    WHERE missive_message_id IS NOT NULL;

COMMENT ON TABLE missive_communications IS 'Stores email communications received via Missive webhooks';
COMMENT ON COLUMN missive_communications.missive_conversation_id IS 'Missive conversation ID';
COMMENT ON COLUMN missive_communications.missive_message_id IS 'Missive message ID (if available)';
COMMENT ON COLUMN missive_communications.rule_type IS 'Type of webhook rule that triggered this (incoming_email, new_comment, etc.)';
COMMENT ON COLUMN missive_communications.client_email IS 'Email address matched to a client in our database';
COMMENT ON COLUMN missive_communications.client_id IS 'Client ID from clients table (matched by email)';
COMMENT ON COLUMN missive_communications.webhook_data IS 'Full webhook payload stored as JSON for reference';

