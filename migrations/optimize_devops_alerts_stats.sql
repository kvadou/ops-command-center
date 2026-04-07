-- Optimize devops_alerts table for /alerts/stats endpoint performance
-- This migration adds composite indexes to speed up the stats query

-- Composite index for (status, severity) - used in multiple FILTER clauses
CREATE INDEX IF NOT EXISTS idx_devops_alerts_status_severity_composite 
ON devops_alerts(status, severity) 
WHERE status = 'open';

-- Composite index for (status, alert_type) - used for payment_failures filter
CREATE INDEX IF NOT EXISTS idx_devops_alerts_status_alert_type 
ON devops_alerts(status, alert_type) 
WHERE status = 'open';

-- Composite index for (status, environment) - used for environment-specific counts
CREATE INDEX IF NOT EXISTS idx_devops_alerts_status_environment 
ON devops_alerts(status, environment) 
WHERE status = 'open';

-- Composite index for (severity, status) with open status filter (alternative ordering)
CREATE INDEX IF NOT EXISTS idx_devops_alerts_severity_status_open 
ON devops_alerts(severity, status) 
WHERE status = 'open';

-- Index on created_at for time-based filters (already exists, but ensuring it's optimal)
-- The existing idx_devops_alerts_created_at should be sufficient

-- Analyze table to update statistics for query planner
ANALYZE devops_alerts;

COMMENT ON INDEX idx_devops_alerts_status_severity_composite IS 'Optimizes stats query for severity counts filtered by open status';
COMMENT ON INDEX idx_devops_alerts_status_alert_type IS 'Optimizes stats query for alert type counts (e.g., payment_failures)';
COMMENT ON INDEX idx_devops_alerts_status_environment IS 'Optimizes stats query for environment-specific alert counts';

