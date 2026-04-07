-- Marketing Command Center Enhancements
-- Adds support for campaign drafts, A/B tests, saved views, and scheduled reports

-- Campaign drafts created by AI for review before pushing to platforms
CREATE TABLE IF NOT EXISTS marketing_campaign_drafts (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES marketing_conversations(id) ON DELETE SET NULL,
  platform VARCHAR(50) NOT NULL,
  campaign_type VARCHAR(50) NOT NULL, -- 'new_campaign', 'ad_copy', 'targeting', 'creative'
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'pushed', 'rejected', 'archived')),
  draft_data JSONB NOT NULL DEFAULT '{}', -- Platform-specific campaign configuration
  ai_reasoning TEXT,
  created_by VARCHAR(255),
  approved_by VARCHAR(255),
  approved_at TIMESTAMP,
  pushed_at TIMESTAMP,
  push_result JSONB,
  external_id VARCHAR(255), -- ID from platform after push
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- A/B test tracking
CREATE TABLE IF NOT EXISTS marketing_ab_tests (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  test_type VARCHAR(50) NOT NULL, -- 'audience', 'creative', 'copy', 'landing_page', 'bidding'
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  hypothesis TEXT,
  start_date DATE,
  end_date DATE,
  winner_variant_id INTEGER, -- References variant that won
  conclusion TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- A/B test variants (control and treatments)
CREATE TABLE IF NOT EXISTS marketing_ab_test_variants (
  id SERIAL PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES marketing_ab_tests(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  is_control BOOLEAN DEFAULT false,
  variant_config JSONB DEFAULT '{}', -- Platform-specific variant details
  external_ids JSONB DEFAULT '{}', -- Campaign/ad IDs from platform
  created_at TIMESTAMP DEFAULT NOW()
);

-- A/B test daily metrics snapshots
CREATE TABLE IF NOT EXISTS marketing_ab_test_metrics (
  id SERIAL PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES marketing_ab_tests(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES marketing_ab_test_variants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  spend DECIMAL(10,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  ctr DECIMAL(8,4) DEFAULT 0,
  cpc DECIMAL(8,2) DEFAULT 0,
  roas DECIMAL(8,2) DEFAULT 0,
  statistical_significance DECIMAL(5,2), -- Percentage confidence
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(test_id, variant_id, date)
);

-- Dashboard saved views
CREATE TABLE IF NOT EXISTS marketing_saved_views (
  id SERIAL PRIMARY KEY,
  user_email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  view_config JSONB NOT NULL DEFAULT '{}', -- date_range, selected_charts, filters, etc.
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Scheduled report configurations
CREATE TABLE IF NOT EXISTS marketing_scheduled_reports (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  report_type VARCHAR(50) NOT NULL DEFAULT 'weekly', -- 'daily', 'weekly', 'monthly'
  schedule_cron VARCHAR(100), -- Cron expression for custom schedules
  is_active BOOLEAN DEFAULT true,
  recipients JSONB DEFAULT '[]', -- Array of email addresses
  report_config JSONB DEFAULT '{}', -- What to include in report
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Scheduled report execution history
CREATE TABLE IF NOT EXISTS marketing_report_runs (
  id SERIAL PRIMARY KEY,
  scheduled_report_id INTEGER REFERENCES marketing_scheduled_reports(id) ON DELETE SET NULL,
  report_type VARCHAR(50) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  report_data JSONB,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketing_campaign_drafts_status ON marketing_campaign_drafts(status);
CREATE INDEX IF NOT EXISTS idx_marketing_campaign_drafts_platform ON marketing_campaign_drafts(platform);
CREATE INDEX IF NOT EXISTS idx_marketing_campaign_drafts_created_at ON marketing_campaign_drafts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_ab_tests_status ON marketing_ab_tests(status);
CREATE INDEX IF NOT EXISTS idx_marketing_ab_tests_platform ON marketing_ab_tests(platform);
CREATE INDEX IF NOT EXISTS idx_marketing_ab_tests_dates ON marketing_ab_tests(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_marketing_ab_test_variants_test_id ON marketing_ab_test_variants(test_id);
CREATE INDEX IF NOT EXISTS idx_marketing_ab_test_metrics_test_id ON marketing_ab_test_metrics(test_id);
CREATE INDEX IF NOT EXISTS idx_marketing_ab_test_metrics_date ON marketing_ab_test_metrics(date);

CREATE INDEX IF NOT EXISTS idx_marketing_saved_views_user ON marketing_saved_views(user_email);
CREATE INDEX IF NOT EXISTS idx_marketing_saved_views_default ON marketing_saved_views(user_email, is_default);

CREATE INDEX IF NOT EXISTS idx_marketing_scheduled_reports_active ON marketing_scheduled_reports(is_active);
CREATE INDEX IF NOT EXISTS idx_marketing_scheduled_reports_next_run ON marketing_scheduled_reports(next_run_at);

CREATE INDEX IF NOT EXISTS idx_marketing_report_runs_status ON marketing_report_runs(status);
CREATE INDEX IF NOT EXISTS idx_marketing_report_runs_created ON marketing_report_runs(created_at DESC);
