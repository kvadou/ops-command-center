-- DevOps Alerts and Monitoring System
-- This table stores alerts detected from Heroku logs and system monitoring

CREATE TABLE IF NOT EXISTS devops_alerts (
  id SERIAL PRIMARY KEY,
  alert_type VARCHAR(50) NOT NULL, -- 'error', 'warning', 'payment_failure', 'performance', 'critical'
  severity VARCHAR(20) NOT NULL, -- 'critical', 'high', 'medium', 'low'
  environment VARCHAR(50) NOT NULL, -- 'main', 'westside', 'eastside'
  source VARCHAR(100) NOT NULL, -- 'heroku_logs', 'stripe_webhook', 'payment_api', etc.
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  log_entry TEXT, -- Original log entry if from Heroku logs
  context JSONB, -- Additional context (submission_id, client_id, error details, etc.)
  status VARCHAR(20) DEFAULT 'open', -- 'open', 'acknowledged', 'resolved', 'dismissed'
  acknowledged_at TIMESTAMP,
  acknowledged_by VARCHAR(100),
  resolved_at TIMESTAMP,
  resolved_by VARCHAR(100),
  resolution_notes TEXT,
  metadata JSONB, -- Additional metadata (error codes, stack traces, etc.)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  slack_notification_sent BOOLEAN DEFAULT FALSE,
  slack_notification_sent_at TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_devops_alerts_status ON devops_alerts(status);
CREATE INDEX IF NOT EXISTS idx_devops_alerts_severity ON devops_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_devops_alerts_environment ON devops_alerts(environment);
CREATE INDEX IF NOT EXISTS idx_devops_alerts_alert_type ON devops_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_devops_alerts_created_at ON devops_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_devops_alerts_source ON devops_alerts(source);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_devops_alerts_status_severity ON devops_alerts(status, severity);
CREATE INDEX IF NOT EXISTS idx_devops_alerts_environment_status ON devops_alerts(environment, status);
CREATE INDEX IF NOT EXISTS idx_devops_alerts_open_critical ON devops_alerts(status, severity) WHERE status = 'open' AND severity = 'critical';

-- Alert Rules Table - for configuring what alerts to send (for scaling back later)
CREATE TABLE IF NOT EXISTS devops_alert_rules (
  id SERIAL PRIMARY KEY,
  rule_name VARCHAR(100) NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT TRUE,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  source VARCHAR(100),
  environment VARCHAR(50),
  pattern TEXT, -- Pattern to match in logs (regex)
  exclude_pattern TEXT, -- Pattern to exclude from matching
  slack_notify BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default alert rules (comprehensive to start, can be scaled back later)
INSERT INTO devops_alert_rules (rule_name, enabled, alert_type, severity, slack_notify) VALUES
  ('all_errors', TRUE, 'error', 'high', TRUE),
  ('payment_failures', TRUE, 'payment_failure', 'critical', TRUE),
  ('stripe_errors', TRUE, 'payment_failure', 'critical', TRUE),
  ('database_errors', TRUE, 'error', 'high', TRUE),
  ('performance_issues', TRUE, 'performance', 'medium', TRUE),
  ('critical_exceptions', TRUE, 'error', 'critical', TRUE)
ON CONFLICT (rule_name) DO NOTHING;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_devops_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_devops_alerts_timestamp
  BEFORE UPDATE ON devops_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_devops_alerts_updated_at();

