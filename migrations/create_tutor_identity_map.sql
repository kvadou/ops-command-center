-- Migration: Create tutor_identity_map for cross-era tutor matching
-- Maps historical tutor names (MindBody, E4) to TutorCruncher contractor records

CREATE TABLE IF NOT EXISTS tutor_identity_map (
  id SERIAL PRIMARY KEY,
  canonical_name VARCHAR(255) NOT NULL,
  tc_contractor_id INTEGER,
  source_system VARCHAR(50) NOT NULL,
  source_tutor_name VARCHAR(255) NOT NULL,
  match_type VARCHAR(50) DEFAULT 'auto_exact',
  verified BOOLEAN DEFAULT FALSE,
  verified_by VARCHAR(255),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_system, source_tutor_name)
);

CREATE INDEX IF NOT EXISTS idx_tutor_identity_map_canonical ON tutor_identity_map(canonical_name);
CREATE INDEX IF NOT EXISTS idx_tutor_identity_map_tc ON tutor_identity_map(tc_contractor_id);
CREATE INDEX IF NOT EXISTS idx_tutor_identity_map_source ON tutor_identity_map(source_system, source_tutor_name);

COMMENT ON TABLE tutor_identity_map IS 'Maps historical tutor names to canonical identities and TC contractor records';
