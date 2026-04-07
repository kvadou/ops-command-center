-- Migration: Create Franchise Academy Tables
-- Creates all tables needed for the Franchise Academy feature

-- Core Academy Tables

-- Programs (e.g., "90-Day Launch Program")
CREATE TABLE IF NOT EXISTS academy_programs (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  total_points INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Phases within programs (e.g., Phase 1: Foundation & Setup)
CREATE TABLE IF NOT EXISTS academy_phases (
  id SERIAL PRIMARY KEY,
  program_id INT REFERENCES academy_programs(id) ON DELETE CASCADE,
  phase_number INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  duration_days INT,
  unlock_requirements JSONB DEFAULT '{}',
  badge_on_complete VARCHAR(100),
  points_on_complete INT DEFAULT 0,
  display_order INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(program_id, phase_number)
);

-- Modules within phases (e.g., "Business Setup Checklist", "Marketing 101 Video")
CREATE TABLE IF NOT EXISTS academy_modules (
  id SERIAL PRIMARY KEY,
  phase_id INT REFERENCES academy_phases(id) ON DELETE CASCADE,
  slug VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  content_type VARCHAR(50) NOT NULL DEFAULT 'document',
  content JSONB,
  video_url VARCHAR(500),
  video_provider VARCHAR(50),
  attachments JSONB DEFAULT '[]',
  points_value INT DEFAULT 10,
  is_required BOOLEAN DEFAULT true,
  is_gate BOOLEAN DEFAULT false,
  display_order INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(phase_id, slug)
);

-- Checklist items within checklist-type modules
CREATE TABLE IF NOT EXISTS academy_checklist_items (
  id SERIAL PRIMARY KEY,
  module_id INT REFERENCES academy_modules(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  help_text TEXT,
  help_link VARCHAR(500),
  due_day INT,
  points_value INT DEFAULT 5,
  is_required BOOLEAN DEFAULT true,
  display_order INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Progress Tracking Tables

-- Main progress record per franchisee per program
CREATE TABLE IF NOT EXISTS academy_franchisee_progress (
  id SERIAL PRIMARY KEY,
  franchise_id VARCHAR(50) NOT NULL,
  program_id INT REFERENCES academy_programs(id) ON DELETE CASCADE,
  user_id INT,
  status VARCHAR(50) DEFAULT 'not_started',
  current_phase INT DEFAULT 1,
  start_date DATE,
  target_completion_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  total_points INT DEFAULT 0,
  current_streak_days INT DEFAULT 0,
  longest_streak_days INT DEFAULT 0,
  last_activity_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(franchise_id, program_id)
);

-- Progress per module
CREATE TABLE IF NOT EXISTS academy_module_progress (
  id SERIAL PRIMARY KEY,
  franchisee_progress_id INT REFERENCES academy_franchisee_progress(id) ON DELETE CASCADE,
  module_id INT REFERENCES academy_modules(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'not_started',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  video_percent_watched INT DEFAULT 0,
  video_completed_at TIMESTAMP WITH TIME ZONE,
  quiz_score INT,
  quiz_attempts INT DEFAULT 0,
  quiz_passed_at TIMESTAMP WITH TIME ZONE,
  points_earned INT DEFAULT 0,
  completed_by_name VARCHAR(255),
  completed_by_email VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(franchisee_progress_id, module_id)
);

-- Progress per checklist item
CREATE TABLE IF NOT EXISTS academy_checklist_progress (
  id SERIAL PRIMARY KEY,
  franchisee_progress_id INT REFERENCES academy_franchisee_progress(id) ON DELETE CASCADE,
  checklist_item_id INT REFERENCES academy_checklist_items(id) ON DELETE CASCADE,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by_name VARCHAR(255),
  completed_by_email VARCHAR(255),
  points_earned INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(franchisee_progress_id, checklist_item_id)
);

-- Gamification Tables

-- Badge definitions
CREATE TABLE IF NOT EXISTS academy_badges (
  id SERIAL PRIMARY KEY,
  badge_key VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(100),
  image_url VARCHAR(500),
  color_scheme JSONB DEFAULT '{"bg": "bg-yellow-100", "text": "text-yellow-800", "border": "border-yellow-300"}',
  unlock_type VARCHAR(50),
  unlock_condition JSONB,
  points_reward INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  display_order INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Earned badges per franchisee
CREATE TABLE IF NOT EXISTS academy_earned_badges (
  id SERIAL PRIMARY KEY,
  franchisee_progress_id INT REFERENCES academy_franchisee_progress(id) ON DELETE CASCADE,
  badge_id INT REFERENCES academy_badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  points_awarded INT DEFAULT 0,
  UNIQUE(franchisee_progress_id, badge_id)
);

-- Points activity log
CREATE TABLE IF NOT EXISTS academy_points_log (
  id SERIAL PRIMARY KEY,
  franchisee_progress_id INT REFERENCES academy_franchisee_progress(id) ON DELETE CASCADE,
  points INT NOT NULL,
  reason VARCHAR(255),
  source_type VARCHAR(50),
  source_id INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Coach Tables

-- Conversation threads
CREATE TABLE IF NOT EXISTS academy_conversations (
  id SERIAL PRIMARY KEY,
  franchise_id VARCHAR(50) NOT NULL,
  user_id INT,
  title VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages within conversations
CREATE TABLE IF NOT EXISTS academy_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INT REFERENCES academy_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Resource documents for RAG
CREATE TABLE IF NOT EXISTS academy_documents (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE,
  category VARCHAR(100),
  content TEXT,
  content_rich JSONB,
  file_url VARCHAR(500),
  content_hash VARCHAR(64),
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document chunks for vector search (embedding column added separately if pgvector is available)
CREATE TABLE IF NOT EXISTS academy_document_chunks (
  id SERIAL PRIMARY KEY,
  document_id INT REFERENCES academy_documents(id) ON DELETE CASCADE,
  chunk_index INT,
  content TEXT NOT NULL,
  token_count INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(document_id, chunk_index)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_academy_phases_program_id ON academy_phases(program_id);
CREATE INDEX IF NOT EXISTS idx_academy_modules_phase_id ON academy_modules(phase_id);
CREATE INDEX IF NOT EXISTS idx_academy_checklist_items_module_id ON academy_checklist_items(module_id);
CREATE INDEX IF NOT EXISTS idx_academy_franchisee_progress_franchise_id ON academy_franchisee_progress(franchise_id);
CREATE INDEX IF NOT EXISTS idx_academy_franchisee_progress_program_id ON academy_franchisee_progress(program_id);
CREATE INDEX IF NOT EXISTS idx_academy_module_progress_franchisee_progress_id ON academy_module_progress(franchisee_progress_id);
CREATE INDEX IF NOT EXISTS idx_academy_module_progress_module_id ON academy_module_progress(module_id);
CREATE INDEX IF NOT EXISTS idx_academy_checklist_progress_franchisee_progress_id ON academy_checklist_progress(franchisee_progress_id);
CREATE INDEX IF NOT EXISTS idx_academy_points_log_franchisee_progress_id ON academy_points_log(franchisee_progress_id);
CREATE INDEX IF NOT EXISTS idx_academy_conversations_franchise_id ON academy_conversations(franchise_id);
CREATE INDEX IF NOT EXISTS idx_academy_messages_conversation_id ON academy_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_academy_document_chunks_document_id ON academy_document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_academy_documents_category ON academy_documents(category);
CREATE INDEX IF NOT EXISTS idx_academy_documents_is_published ON academy_documents(is_published);

-- Comments for documentation
COMMENT ON TABLE academy_programs IS 'Academy training programs (e.g., 90-Day Launch)';
COMMENT ON TABLE academy_phases IS 'Phases within a program (e.g., Foundation, Market Activation)';
COMMENT ON TABLE academy_modules IS 'Training modules within phases (videos, checklists, documents)';
COMMENT ON TABLE academy_checklist_items IS 'Individual checklist items within checklist-type modules';
COMMENT ON TABLE academy_franchisee_progress IS 'Main progress tracking per franchisee per program';
COMMENT ON TABLE academy_module_progress IS 'Progress tracking per module';
COMMENT ON TABLE academy_checklist_progress IS 'Progress tracking per checklist item';
COMMENT ON TABLE academy_badges IS 'Badge definitions for gamification';
COMMENT ON TABLE academy_earned_badges IS 'Badges earned by franchisees';
COMMENT ON TABLE academy_points_log IS 'Points activity log for auditing';
COMMENT ON TABLE academy_conversations IS 'AI coach conversation threads';
COMMENT ON TABLE academy_messages IS 'Messages within AI coach conversations';
COMMENT ON TABLE academy_documents IS 'Resource documents for the knowledge base';
COMMENT ON TABLE academy_document_chunks IS 'Chunked documents for RAG vector search';
