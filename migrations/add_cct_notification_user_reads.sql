-- Migration: Add per-user read tracking for CCT notifications
-- Before: read_at/read_by on cct_notifications was team-wide (one user dismisses, all see dismissed)
-- After: Each user has their own read state via junction table

CREATE TABLE IF NOT EXISTS cct_notification_user_reads (
    notification_id UUID NOT NULL REFERENCES cct_notifications(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    read_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (notification_id, user_id)
);

-- Index for efficient per-user queries
CREATE INDEX IF NOT EXISTS idx_cct_user_reads_user ON cct_notification_user_reads(user_id);

-- Note: Keeping existing read_at and read_by columns on cct_notifications as audit trail
-- New per-user system takes precedence for read state
