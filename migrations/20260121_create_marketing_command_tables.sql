-- Marketing Command Center Tables
-- AI-powered marketing adviser with chat interface and action approval workflow

-- Conversation threads for marketing command center
CREATE TABLE IF NOT EXISTS marketing_conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  user_email VARCHAR(255),
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Messages within conversations
CREATE TABLE IF NOT EXISTS marketing_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES marketing_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Pending actions awaiting approval
CREATE TABLE IF NOT EXISTS marketing_pending_actions (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES marketing_conversations(id) ON DELETE SET NULL,
  message_id INTEGER REFERENCES marketing_messages(id) ON DELETE SET NULL,
  action_type VARCHAR(50) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  target_id VARCHAR(255),
  target_name VARCHAR(255),
  action_payload JSONB DEFAULT '{}',
  ai_reasoning TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  approved_by VARCHAR(255),
  approved_at TIMESTAMP,
  executed_at TIMESTAMP,
  execution_result JSONB,
  rollback_payload JSONB,
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit log (immutable) for all executed actions
CREATE TABLE IF NOT EXISTS marketing_action_log (
  id SERIAL PRIMARY KEY,
  pending_action_id INTEGER REFERENCES marketing_pending_actions(id) ON DELETE SET NULL,
  action_type VARCHAR(50) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  before_state JSONB,
  after_state JSONB,
  executed_by VARCHAR(255),
  executed_at TIMESTAMP DEFAULT NOW(),
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

-- Cached insights for faster context building
CREATE TABLE IF NOT EXISTS marketing_insights_cache (
  id SERIAL PRIMARY KEY,
  insight_type VARCHAR(50) NOT NULL,
  insight_key VARCHAR(255) NOT NULL,
  data JSONB DEFAULT '{}',
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(insight_type, insight_key)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_marketing_conversations_user_id ON marketing_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_conversations_created_at ON marketing_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_messages_conversation_id ON marketing_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_marketing_messages_created_at ON marketing_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_marketing_pending_actions_status ON marketing_pending_actions(status);
CREATE INDEX IF NOT EXISTS idx_marketing_pending_actions_expires_at ON marketing_pending_actions(expires_at);
CREATE INDEX IF NOT EXISTS idx_marketing_pending_actions_conversation_id ON marketing_pending_actions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_marketing_action_log_executed_at ON marketing_action_log(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_insights_cache_expires ON marketing_insights_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_marketing_insights_cache_type_key ON marketing_insights_cache(insight_type, insight_key);
