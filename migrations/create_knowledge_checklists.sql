-- Knowledge Hub Checklists Migration
-- Enables franchisee-specific progress tracking on onboarding checklists
-- Created: 2024-12-02

-- =====================================================
-- CHECKLIST ITEMS (defined by HQ, attached to articles)
-- =====================================================
CREATE TABLE IF NOT EXISTS knowledge_checklist_items (
  id SERIAL PRIMARY KEY,
  article_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  help_text TEXT,                      -- Optional guidance/instructions
  help_link VARCHAR(500),              -- Optional link to resource
  display_order INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT true,
  due_days INTEGER,                    -- Days from onboarding start to complete (optional)
  category VARCHAR(100),               -- Group items: 'legal', 'financial', 'setup', etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups by article
CREATE INDEX IF NOT EXISTS idx_checklist_items_article ON knowledge_checklist_items(article_id);

-- =====================================================
-- CHECKLIST PROGRESS (per franchise completion tracking)
-- =====================================================
CREATE TABLE IF NOT EXISTS knowledge_checklist_progress (
  id SERIAL PRIMARY KEY,
  checklist_item_id INTEGER NOT NULL REFERENCES knowledge_checklist_items(id) ON DELETE CASCADE,
  franchise_id VARCHAR(50) NOT NULL,   -- 'main', 'eastside', 'westside', etc.
  is_completed BOOLEAN DEFAULT false,
  completed_by_email VARCHAR(255),
  completed_by_name VARCHAR(255),
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,                          -- Franchise can add notes/comments
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(checklist_item_id, franchise_id)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_checklist_progress_franchise ON knowledge_checklist_progress(franchise_id);
CREATE INDEX IF NOT EXISTS idx_checklist_progress_item ON knowledge_checklist_progress(checklist_item_id);
CREATE INDEX IF NOT EXISTS idx_checklist_progress_completed ON knowledge_checklist_progress(franchise_id, is_completed);

-- =====================================================
-- FRANCHISE ONBOARDING (track overall franchise status)
-- =====================================================
CREATE TABLE IF NOT EXISTS franchise_onboarding (
  id SERIAL PRIMARY KEY,
  franchise_id VARCHAR(50) UNIQUE NOT NULL,
  franchise_name VARCHAR(255),
  owner_name VARCHAR(255),
  owner_email VARCHAR(255),
  start_date DATE NOT NULL,
  target_completion_date DATE,
  status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('not_started', 'in_progress', 'completed', 'paused')),
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- HELPER VIEW: Franchise Progress Summary
-- =====================================================
CREATE OR REPLACE VIEW franchise_checklist_summary AS
SELECT 
  fo.franchise_id,
  fo.franchise_name,
  fo.owner_name,
  fo.start_date,
  fo.status as onboarding_status,
  COUNT(DISTINCT kci.id) as total_items,
  COUNT(DISTINCT CASE WHEN kcp.is_completed THEN kci.id END) as completed_items,
  ROUND(
    (COUNT(DISTINCT CASE WHEN kcp.is_completed THEN kci.id END)::DECIMAL / 
     NULLIF(COUNT(DISTINCT kci.id), 0)) * 100, 1
  ) as completion_percentage,
  MAX(kcp.completed_at) as last_activity
FROM franchise_onboarding fo
CROSS JOIN knowledge_checklist_items kci
LEFT JOIN knowledge_checklist_progress kcp 
  ON kci.id = kcp.checklist_item_id 
  AND fo.franchise_id = kcp.franchise_id
GROUP BY fo.franchise_id, fo.franchise_name, fo.owner_name, fo.start_date, fo.status;

-- =====================================================
-- HELPER VIEW: Article Checklist Progress by Franchise
-- =====================================================
CREATE OR REPLACE VIEW article_checklist_progress AS
SELECT 
  kci.article_id,
  kcp.franchise_id,
  COUNT(kci.id) as total_items,
  COUNT(CASE WHEN kcp.is_completed THEN 1 END) as completed_items,
  ROUND(
    (COUNT(CASE WHEN kcp.is_completed THEN 1 END)::DECIMAL / 
     NULLIF(COUNT(kci.id), 0)) * 100, 1
  ) as completion_percentage
FROM knowledge_checklist_items kci
LEFT JOIN knowledge_checklist_progress kcp ON kci.id = kcp.checklist_item_id
WHERE kcp.franchise_id IS NOT NULL
GROUP BY kci.article_id, kcp.franchise_id;

-- =====================================================
-- SEED DATA: Register existing franchises
-- =====================================================
INSERT INTO franchise_onboarding (franchise_id, franchise_name, owner_name, start_date, status)
VALUES 
  ('eastside', 'Acme Operations Eastside', 'Eastside Franchise Owner', '2024-01-01', 'in_progress'),
  ('westside', 'Acme Operations Westside', 'Westside Franchise Owner', '2024-01-01', 'in_progress')
ON CONFLICT (franchise_id) DO NOTHING;

-- =====================================================
-- Grant comments
-- =====================================================
COMMENT ON TABLE knowledge_checklist_items IS 'Checklist items defined by HQ, attached to knowledge articles';
COMMENT ON TABLE knowledge_checklist_progress IS 'Per-franchise progress tracking for checklist items';
COMMENT ON TABLE franchise_onboarding IS 'Franchise onboarding status and metadata';
COMMENT ON VIEW franchise_checklist_summary IS 'Aggregated checklist completion by franchise';
COMMENT ON VIEW article_checklist_progress IS 'Checklist completion by article and franchise';

