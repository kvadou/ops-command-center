-- Migration: Create Klaviyo Analytics Tables
-- This migration creates comprehensive tables to store Klaviyo API data
-- for analytics and reporting purposes

-- 1. Klaviyo Campaigns Table
-- Stores campaign information from Klaviyo API
CREATE TABLE IF NOT EXISTS klaviyo_campaigns (
    id VARCHAR(255) PRIMARY KEY, -- Klaviyo campaign ID
    name VARCHAR(500),
    status VARCHAR(50), -- draft, scheduled, sent, cancelled
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    subject TEXT,
    from_name VARCHAR(255),
    from_email VARCHAR(255),
    reply_to_email VARCHAR(255),
    message_type VARCHAR(50), -- email, sms
    template_id VARCHAR(255),
    archived BOOLEAN DEFAULT FALSE,
    raw_data JSONB, -- Store full API response for future use
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by_script_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_klaviyo_campaigns_status ON klaviyo_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_klaviyo_campaigns_created_at ON klaviyo_campaigns(created_at);
CREATE INDEX IF NOT EXISTS idx_klaviyo_campaigns_sent_at ON klaviyo_campaigns(sent_at);

-- 2. Klaviyo Campaign Metrics Table
-- Stores campaign performance metrics (sent, delivered, opens, clicks, etc.)
CREATE TABLE IF NOT EXISTS klaviyo_campaign_metrics (
    id SERIAL PRIMARY KEY,
    campaign_id VARCHAR(255) NOT NULL REFERENCES klaviyo_campaigns(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL, -- Date for daily metrics
    metric_type VARCHAR(50) NOT NULL, -- sent, delivered, opened, clicked, bounced, unsubscribed, spam_complaint, conversion, revenue
    count INTEGER DEFAULT 0,
    unique_count INTEGER DEFAULT 0, -- For opens, clicks
    value DECIMAL(10, 2) DEFAULT 0, -- For revenue metrics
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(campaign_id, metric_date, metric_type)
);

CREATE INDEX IF NOT EXISTS idx_klaviyo_campaign_metrics_campaign_id ON klaviyo_campaign_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_klaviyo_campaign_metrics_date ON klaviyo_campaign_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_klaviyo_campaign_metrics_type ON klaviyo_campaign_metrics(metric_type);

-- 3. Klaviyo Profiles Table
-- Stores profile/subscriber information from Klaviyo
CREATE TABLE IF NOT EXISTS klaviyo_profiles (
    id VARCHAR(255) PRIMARY KEY, -- Klaviyo profile ID
    email VARCHAR(255),
    phone_number VARCHAR(50),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    location VARCHAR(255),
    timezone VARCHAR(100),
    country VARCHAR(100),
    region VARCHAR(100),
    city VARCHAR(100),
    zip VARCHAR(50),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    organization VARCHAR(255),
    title VARCHAR(255),
    image VARCHAR(500),
    created TIMESTAMP WITH TIME ZONE,
    updated TIMESTAMP WITH TIME ZONE,
    subscribed BOOLEAN DEFAULT TRUE,
    unsubscribed_at TIMESTAMP WITH TIME ZONE,
    raw_data JSONB, -- Store full API response
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by_script_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_klaviyo_profiles_email ON klaviyo_profiles(email);
CREATE INDEX IF NOT EXISTS idx_klaviyo_profiles_phone ON klaviyo_profiles(phone_number);
CREATE INDEX IF NOT EXISTS idx_klaviyo_profiles_created ON klaviyo_profiles(created);
CREATE INDEX IF NOT EXISTS idx_klaviyo_profiles_subscribed ON klaviyo_profiles(subscribed);

-- 4. Klaviyo Lists Table
-- Stores email list information
CREATE TABLE IF NOT EXISTS klaviyo_lists (
    id VARCHAR(255) PRIMARY KEY, -- Klaviyo list ID
    name VARCHAR(500),
    created TIMESTAMP WITH TIME ZONE,
    updated TIMESTAMP WITH TIME ZONE,
    list_type VARCHAR(50), -- list, segment
    raw_data JSONB,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by_script_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_klaviyo_lists_name ON klaviyo_lists(name);

-- 5. Klaviyo List Members Table
-- Links profiles to lists
CREATE TABLE IF NOT EXISTS klaviyo_list_members (
    id SERIAL PRIMARY KEY,
    list_id VARCHAR(255) NOT NULL REFERENCES klaviyo_lists(id) ON DELETE CASCADE,
    profile_id VARCHAR(255) NOT NULL REFERENCES klaviyo_profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(list_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_klaviyo_list_members_list_id ON klaviyo_list_members(list_id);
CREATE INDEX IF NOT EXISTS idx_klaviyo_list_members_profile_id ON klaviyo_list_members(profile_id);

-- 6. Klaviyo Flows Table
-- Stores automated flow information
CREATE TABLE IF NOT EXISTS klaviyo_flows (
    id VARCHAR(255) PRIMARY KEY, -- Klaviyo flow ID
    name VARCHAR(500),
    status VARCHAR(50), -- draft, live, stopped
    created TIMESTAMP WITH TIME ZONE,
    updated TIMESTAMP WITH TIME ZONE,
    triggered_count INTEGER DEFAULT 0,
    raw_data JSONB,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by_script_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_klaviyo_flows_status ON klaviyo_flows(status);
CREATE INDEX IF NOT EXISTS idx_klaviyo_flows_created ON klaviyo_flows(created);

-- 7. Klaviyo Flow Metrics Table
-- Stores flow performance metrics
CREATE TABLE IF NOT EXISTS klaviyo_flow_metrics (
    id SERIAL PRIMARY KEY,
    flow_id VARCHAR(255) NOT NULL REFERENCES klaviyo_flows(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    metric_type VARCHAR(50) NOT NULL, -- sent, delivered, opened, clicked, conversion, revenue
    count INTEGER DEFAULT 0,
    unique_count INTEGER DEFAULT 0,
    value DECIMAL(10, 2) DEFAULT 0,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(flow_id, metric_date, metric_type)
);

CREATE INDEX IF NOT EXISTS idx_klaviyo_flow_metrics_flow_id ON klaviyo_flow_metrics(flow_id);
CREATE INDEX IF NOT EXISTS idx_klaviyo_flow_metrics_date ON klaviyo_flow_metrics(metric_date);

-- 8. Klaviyo Events Table
-- Stores event tracking data (purchases, page views, etc.)
CREATE TABLE IF NOT EXISTS klaviyo_events (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(255) UNIQUE, -- Klaviyo event ID
    profile_id VARCHAR(255) REFERENCES klaviyo_profiles(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL, -- Placed Order, Viewed Product, etc.
    metric_id VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    value DECIMAL(10, 2),
    properties JSONB, -- Event-specific properties
    raw_data JSONB,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by_script_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_klaviyo_events_profile_id ON klaviyo_events(profile_id);
CREATE INDEX IF NOT EXISTS idx_klaviyo_events_type ON klaviyo_events(event_type);
CREATE INDEX IF NOT EXISTS idx_klaviyo_events_timestamp ON klaviyo_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_klaviyo_events_metric_id ON klaviyo_events(metric_id);

-- 9. Klaviyo Metrics Table
-- Stores general metrics (not tied to specific campaigns/flows)
CREATE TABLE IF NOT EXISTS klaviyo_metrics (
    id VARCHAR(255) PRIMARY KEY, -- Klaviyo metric ID
    name VARCHAR(500),
    created TIMESTAMP WITH TIME ZONE,
    updated TIMESTAMP WITH TIME ZONE,
    metric_type VARCHAR(50), -- event, aggregate
    integration VARCHAR(100),
    raw_data JSONB,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by_script_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_klaviyo_metrics_type ON klaviyo_metrics(metric_type);

-- 10. Klaviyo Sync Log Table
-- Tracks sync operations for debugging and monitoring
CREATE TABLE IF NOT EXISTS klaviyo_sync_log (
    id SERIAL PRIMARY KEY,
    sync_type VARCHAR(50) NOT NULL, -- campaigns, profiles, lists, flows, events, metrics
    status VARCHAR(50) NOT NULL, -- success, error, partial
    records_synced INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    raw_response JSONB
);

CREATE INDEX IF NOT EXISTS idx_klaviyo_sync_log_type ON klaviyo_sync_log(sync_type);
CREATE INDEX IF NOT EXISTS idx_klaviyo_sync_log_status ON klaviyo_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_klaviyo_sync_log_started_at ON klaviyo_sync_log(started_at);

COMMENT ON TABLE klaviyo_campaigns IS 'Stores Klaviyo email/SMS campaign information';
COMMENT ON TABLE klaviyo_campaign_metrics IS 'Stores daily campaign performance metrics';
COMMENT ON TABLE klaviyo_profiles IS 'Stores Klaviyo subscriber/profile information';
COMMENT ON TABLE klaviyo_lists IS 'Stores Klaviyo email list information';
COMMENT ON TABLE klaviyo_list_members IS 'Links profiles to lists';
COMMENT ON TABLE klaviyo_flows IS 'Stores Klaviyo automated flow information';
COMMENT ON TABLE klaviyo_flow_metrics IS 'Stores flow performance metrics';
COMMENT ON TABLE klaviyo_events IS 'Stores event tracking data (purchases, page views, etc.)';
COMMENT ON TABLE klaviyo_metrics IS 'Stores general Klaviyo metrics';
COMMENT ON TABLE klaviyo_sync_log IS 'Tracks sync operations for monitoring and debugging';

