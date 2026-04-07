-- Notifications System Migration
-- Creates tables for in-app notifications and user preferences
-- Run this migration on all environments: local, staging, production, westside, eastside

-- ============================================
-- PHASE 1: Create notifications table
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    data JSONB DEFAULT '{}'::jsonb,
    
    -- Link to related content
    post_id UUID REFERENCES news_feed_posts(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES news_feed_comments(id) ON DELETE CASCADE,
    
    -- Actor who triggered the notification
    actor_id VARCHAR(255),
    actor_name VARCHAR(255),
    actor_avatar TEXT,
    
    -- Status
    read_at TIMESTAMP,
    clicked_at TIMESTAMP,
    email_sent_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_post ON notifications(post_id) WHERE post_id IS NOT NULL;

-- ============================================
-- PHASE 2: Create user notification preferences
-- ============================================

CREATE TABLE IF NOT EXISTS user_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL UNIQUE,
    
    -- In-app notification preferences
    notify_mentions BOOLEAN DEFAULT TRUE,
    notify_comments BOOLEAN DEFAULT TRUE,
    notify_replies BOOLEAN DEFAULT TRUE,
    notify_reactions BOOLEAN DEFAULT TRUE,
    notify_announcements BOOLEAN DEFAULT TRUE,
    notify_moderation BOOLEAN DEFAULT TRUE,
    
    -- Email notification preferences
    email_mentions BOOLEAN DEFAULT TRUE,
    email_comments BOOLEAN DEFAULT TRUE,
    email_replies BOOLEAN DEFAULT TRUE,
    email_reactions BOOLEAN DEFAULT FALSE,
    email_announcements BOOLEAN DEFAULT TRUE,
    email_moderation BOOLEAN DEFAULT TRUE,
    email_digest BOOLEAN DEFAULT FALSE,
    email_digest_frequency VARCHAR(20) DEFAULT 'daily',
    
    -- Push notification preferences (future)
    push_enabled BOOLEAN DEFAULT FALSE,
    push_mentions BOOLEAN DEFAULT TRUE,
    push_comments BOOLEAN DEFAULT TRUE,
    push_announcements BOOLEAN DEFAULT TRUE,
    
    -- Quiet hours (future)
    quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    quiet_hours_timezone VARCHAR(50),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON user_notification_preferences(user_id);

-- ============================================
-- PHASE 3: Create notification batches for digest emails
-- ============================================

CREATE TABLE IF NOT EXISTS notification_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    batch_type VARCHAR(20) NOT NULL DEFAULT 'daily',
    notification_ids UUID[] NOT NULL,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_batches_user ON notification_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_batches_pending ON notification_batches(sent_at) WHERE sent_at IS NULL;

-- ============================================
-- Documentation
-- ============================================

COMMENT ON TABLE notifications IS 'In-app notifications for news feed activity';
COMMENT ON COLUMN notifications.type IS 'Notification type: mention, comment, reply, reaction, post_approved, post_rejected, announcement, franchisee_post';
COMMENT ON COLUMN notifications.data IS 'Additional context data as JSONB (e.g., post title, comment excerpt)';
COMMENT ON COLUMN notifications.actor_id IS 'User who triggered the notification';

COMMENT ON TABLE user_notification_preferences IS 'User preferences for notification delivery';
COMMENT ON COLUMN user_notification_preferences.email_digest_frequency IS 'Frequency: daily, weekly';

COMMENT ON TABLE notification_batches IS 'Batched notifications for digest email delivery';

-- ============================================
-- Helper function to get unread notification count
-- ============================================

CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id VARCHAR)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER
        FROM notifications
        WHERE user_id = p_user_id AND read_at IS NULL
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_unread_notification_count IS 'Returns count of unread notifications for a user';

