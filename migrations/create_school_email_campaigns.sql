-- Migration: Create School Email Campaigns System
-- This migration creates tables for managing email communications with schools

-- 1. School Email Contacts Table
-- Stores preferred email addresses and contact information for each school
CREATE TABLE IF NOT EXISTS school_email_contacts (
    id SERIAL PRIMARY KEY,
    school_client_id VARCHAR(255) NOT NULL, -- Can be real client_id or SCHOOL_* synthetic ID
    school_name VARCHAR(255) NOT NULL,
    
    -- Contact Information
    contact_name VARCHAR(255),
    contact_role VARCHAR(100), -- 'admin', 'principal', 'coordinator', 'parent', etc.
    email_address VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    
    -- Contact Preferences
    is_primary BOOLEAN DEFAULT FALSE, -- Primary contact for this school
    preferred_contact_method VARCHAR(50) DEFAULT 'email', -- 'email', 'phone', 'both'
    contact_type VARCHAR(50) DEFAULT 'admin', -- 'admin', 'billing', 'parent', 'other'
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255),
    notes TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_school_email_contacts_school_client_id ON school_email_contacts(school_client_id);
CREATE INDEX IF NOT EXISTS idx_school_email_contacts_school_name ON school_email_contacts(school_name);
CREATE INDEX IF NOT EXISTS idx_school_email_contacts_email ON school_email_contacts(email_address);
CREATE INDEX IF NOT EXISTS idx_school_email_contacts_is_primary ON school_email_contacts(is_primary) WHERE is_primary = TRUE;

-- 2. School Email Campaign Templates Table
-- Defines standard email templates for different campaign types
CREATE TABLE IF NOT EXISTS school_email_campaign_templates (
    id SERIAL PRIMARY KEY,
    campaign_type VARCHAR(100) NOT NULL UNIQUE, -- 'demo_day', 'follow_up', 'parent_engagement', 'enrollment', 'retention', etc.
    campaign_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Email Content
    subject_template TEXT NOT NULL,
    body_template TEXT NOT NULL, -- HTML template
    from_name VARCHAR(255) DEFAULT 'Acme Operations',
    from_email VARCHAR(255) DEFAULT 'support@acmeops.com',
    
    -- Scheduling
    default_days_after_trigger INTEGER, -- Days after trigger event (e.g., 7 days after enrollment)
    default_send_time TIME DEFAULT '09:00:00', -- Default time to send
    
    -- Settings
    is_active BOOLEAN DEFAULT TRUE,
    requires_approval BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255)
);

-- 3. School Email Campaign Schedule Table
-- Defines the email cadence/schedule for each school
CREATE TABLE IF NOT EXISTS school_email_campaign_schedules (
    id SERIAL PRIMARY KEY,
    school_client_id VARCHAR(255) NOT NULL,
    school_name VARCHAR(255) NOT NULL,
    campaign_type VARCHAR(100) NOT NULL,
    
    -- Schedule Configuration
    is_enabled BOOLEAN DEFAULT TRUE,
    frequency VARCHAR(50) DEFAULT 'one-time', -- 'one-time', 'weekly', 'monthly', 'custom'
    trigger_event VARCHAR(100), -- 'enrollment', 'term_start', 'term_end', 'custom_date', etc.
    days_after_trigger INTEGER DEFAULT 0,
    send_time TIME DEFAULT '09:00:00',
    
    -- Custom Schedule (for complex cadences)
    schedule_json JSONB, -- For storing complex schedule rules
    
    -- Recipients
    recipient_contact_ids INTEGER[], -- Array of school_email_contacts.id
    additional_emails TEXT[], -- Additional email addresses
    
    -- Override Template
    custom_subject TEXT,
    custom_body TEXT,
    
    -- Status
    last_sent_at TIMESTAMP WITH TIME ZONE,
    next_scheduled_at TIMESTAMP WITH TIME ZONE,
    total_sent INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255),
    notes TEXT,
    
    UNIQUE(school_client_id, campaign_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_school_email_schedules_school_client_id ON school_email_campaign_schedules(school_client_id);
CREATE INDEX IF NOT EXISTS idx_school_email_schedules_campaign_type ON school_email_campaign_schedules(campaign_type);
CREATE INDEX IF NOT EXISTS idx_school_email_schedules_next_scheduled ON school_email_campaign_schedules(next_scheduled_at) WHERE is_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_school_email_schedules_is_enabled ON school_email_campaign_schedules(is_enabled);

-- 4. School Email Campaigns Table
-- Tracks individual email sends
CREATE TABLE IF NOT EXISTS school_email_campaigns (
    id SERIAL PRIMARY KEY,
    school_client_id VARCHAR(255) NOT NULL,
    school_name VARCHAR(255) NOT NULL,
    campaign_type VARCHAR(100) NOT NULL,
    schedule_id INTEGER REFERENCES school_email_campaign_schedules(id),
    
    -- Email Details
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    from_name VARCHAR(255),
    from_email VARCHAR(255),
    
    -- Recipients
    recipient_emails TEXT[] NOT NULL,
    recipient_names TEXT[],
    
    -- Brevo Integration
    brevo_message_id VARCHAR(255), -- Brevo message ID for tracking
    brevo_campaign_id INTEGER, -- Brevo campaign ID if part of a campaign
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'scheduled', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'
    scheduled_for TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    
    -- Tracking
    email_delivered_at TIMESTAMP WITH TIME ZONE,
    email_opened_at TIMESTAMP WITH TIME ZONE,
    email_opened_count INTEGER DEFAULT 0,
    email_clicked_at TIMESTAMP WITH TIME ZONE,
    email_clicked_count INTEGER DEFAULT 0,
    email_clicked_urls TEXT[],
    email_bounced_at TIMESTAMP WITH TIME ZONE,
    email_complained_at TIMESTAMP WITH TIME ZONE,
    email_unsubscribed_at TIMESTAMP WITH TIME ZONE,
    
    -- Engagement Metrics
    engagement_score DECIMAL(3,2) DEFAULT 0.00,
    last_engagement_at TIMESTAMP WITH TIME ZONE,
    
    -- Brevo Events (JSONB for storing all webhook events)
    brevo_events JSONB DEFAULT '[]',
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255),
    notes TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_school_email_campaigns_school_client_id ON school_email_campaigns(school_client_id);
CREATE INDEX IF NOT EXISTS idx_school_email_campaigns_campaign_type ON school_email_campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS idx_school_email_campaigns_status ON school_email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_school_email_campaigns_scheduled_for ON school_email_campaigns(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_school_email_campaigns_brevo_message_id ON school_email_campaigns(brevo_message_id);
CREATE INDEX IF NOT EXISTS idx_school_email_campaigns_sent_at ON school_email_campaigns(sent_at DESC);

-- 5. School Email Campaign Analytics Table
-- Aggregated analytics per school per campaign type
CREATE TABLE IF NOT EXISTS school_email_campaign_analytics (
    id SERIAL PRIMARY KEY,
    school_client_id VARCHAR(255) NOT NULL,
    school_name VARCHAR(255) NOT NULL,
    campaign_type VARCHAR(100) NOT NULL,
    
    -- Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Metrics
    total_sent INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    total_opened INTEGER DEFAULT 0,
    total_clicked INTEGER DEFAULT 0,
    total_bounced INTEGER DEFAULT 0,
    total_complained INTEGER DEFAULT 0,
    total_unsubscribed INTEGER DEFAULT 0,
    
    -- Rates
    delivery_rate DECIMAL(5,2) DEFAULT 0.00,
    open_rate DECIMAL(5,2) DEFAULT 0.00,
    click_rate DECIMAL(5,2) DEFAULT 0.00,
    bounce_rate DECIMAL(5,2) DEFAULT 0.00,
    
    -- Engagement
    avg_engagement_score DECIMAL(3,2) DEFAULT 0.00,
    total_engagement_score DECIMAL(10,2) DEFAULT 0.00,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(school_client_id, campaign_type, period_start, period_end)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_school_email_analytics_school_client_id ON school_email_campaign_analytics(school_client_id);
CREATE INDEX IF NOT EXISTS idx_school_email_analytics_campaign_type ON school_email_campaign_analytics(campaign_type);
CREATE INDEX IF NOT EXISTS idx_school_email_analytics_period ON school_email_campaign_analytics(period_start, period_end);

-- Functions and Triggers
CREATE OR REPLACE FUNCTION update_school_email_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_school_email_contacts_updated_at ON school_email_contacts;
CREATE TRIGGER update_school_email_contacts_updated_at
    BEFORE UPDATE ON school_email_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_school_email_updated_at();

DROP TRIGGER IF EXISTS update_school_email_templates_updated_at ON school_email_campaign_templates;
CREATE TRIGGER update_school_email_templates_updated_at
    BEFORE UPDATE ON school_email_campaign_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_school_email_updated_at();

DROP TRIGGER IF EXISTS update_school_email_schedules_updated_at ON school_email_campaign_schedules;
CREATE TRIGGER update_school_email_schedules_updated_at
    BEFORE UPDATE ON school_email_campaign_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_school_email_updated_at();

DROP TRIGGER IF EXISTS update_school_email_campaigns_updated_at ON school_email_campaigns;
CREATE TRIGGER update_school_email_campaigns_updated_at
    BEFORE UPDATE ON school_email_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_school_email_updated_at();

DROP TRIGGER IF EXISTS update_school_email_analytics_updated_at ON school_email_campaign_analytics;
CREATE TRIGGER update_school_email_analytics_updated_at
    BEFORE UPDATE ON school_email_campaign_analytics
    FOR EACH ROW
    EXECUTE FUNCTION update_school_email_updated_at();

-- Comments
COMMENT ON TABLE school_email_contacts IS 'Stores preferred email addresses and contact information for each school';
COMMENT ON TABLE school_email_campaign_templates IS 'Defines standard email templates for different campaign types';
COMMENT ON TABLE school_email_campaign_schedules IS 'Defines the email cadence/schedule for each school';
COMMENT ON TABLE school_email_campaigns IS 'Tracks individual email sends with Brevo integration and tracking';
COMMENT ON TABLE school_email_campaign_analytics IS 'Aggregated analytics per school per campaign type';

-- Insert default campaign templates
INSERT INTO school_email_campaign_templates (campaign_type, campaign_name, description, subject_template, body_template, default_days_after_trigger) VALUES
('demo_day', 'Demo Day Invitation', 'Invitation email for school demo day events', 'Join Us for a Acme Operations Demo Day at {{school_name}}', '<p>Dear {{contact_name}},</p><p>We would love to invite you to a Acme Operations Demo Day at {{school_name}}!</p><p>This is a great opportunity to see our program in action and learn how we can support your students.</p><p>Best regards,<br>Acme Operations Team</p>', 0),
('follow_up', 'Follow Up After Demo', 'Follow-up email after demo day or initial meeting', 'Following Up: Acme Operations at {{school_name}}', '<p>Dear {{contact_name}},</p><p>Thank you for your interest in Acme Operations at {{school_name}}.</p><p>We would love to discuss how we can bring our chess program to your school.</p><p>Best regards,<br>Acme Operations Team</p>', 3),
('parent_engagement', 'Parent Engagement', 'Email to engage parents and increase enrollment', 'Acme Operations at {{school_name}} - Enroll Your Child Today!', '<p>Dear Parents,</p><p>We are excited to offer Acme Operations at {{school_name}}!</p><p>Enroll your child today to give them the gift of chess education.</p><p>Best regards,<br>Acme Operations Team</p>', 7),
('enrollment_reminder', 'Enrollment Reminder', 'Reminder to enroll before term starts', 'Last Chance: Enroll in Acme Operations at {{school_name}}', '<p>Dear Parents,</p><p>Don''t miss out! Enrollment for Acme Operations at {{school_name}} is closing soon.</p><p>Enroll today to secure your child''s spot.</p><p>Best regards,<br>Acme Operations Team</p>', 14),
('retention', 'Retention Campaign', 'Email to retain students for next term', 'Continue Your Chess Journey: Re-enroll for Next Term', '<p>Dear Parents,</p><p>We hope your child has enjoyed Acme Operations this term!</p><p>Re-enroll now to continue their chess journey with us.</p><p>Best regards,<br>Acme Operations Team</p>', 30),
('term_start', 'Term Start Welcome', 'Welcome email at the start of a new term', 'Welcome to Acme Operations at {{school_name}}!', '<p>Dear Parents and Students,</p><p>Welcome to a new term of Acme Operations at {{school_name}}!</p><p>We are excited to begin this chess journey with you.</p><p>Best regards,<br>Acme Operations Team</p>', 0),
('term_end', 'Term End Thank You', 'Thank you email at the end of a term', 'Thank You for a Great Term!', '<p>Dear Parents and Students,</p><p>Thank you for a wonderful term of Acme Operations at {{school_name}}!</p><p>We hope to see you again next term.</p><p>Best regards,<br>Acme Operations Team</p>', 0)
ON CONFLICT (campaign_type) DO NOTHING;

