-- Create only the missing automation tables for the Task Automation System

-- 1. Task Workflow Templates
CREATE TABLE IF NOT EXISTS task_workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  icon TEXT,
  template_data JSONB NOT NULL,
  default_board_name TEXT,
  default_groups JSONB,
  is_active BOOLEAN DEFAULT true,
  is_system_template BOOLEAN DEFAULT false,
  branch_id TEXT,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_category ON task_workflow_templates(category) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_workflow_templates_branch ON task_workflow_templates(branch_id) WHERE deleted_at IS NULL;

-- 2. Task Workflow Instances
CREATE TABLE IF NOT EXISTS task_workflow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES task_workflow_templates(id),
  board_id UUID NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
  context_data JSONB,
  created_task_ids JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'failed')),
  completed_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  executed_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_board_id ON task_workflow_instances(board_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_template_id ON task_workflow_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON task_workflow_instances(status);

-- 3. Task Automation Rules
CREATE TABLE IF NOT EXISTS task_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT true,
  board_id UUID REFERENCES task_boards(id) ON DELETE CASCADE,
  branch_id TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('status_change', 'date_based', 'external_event', 'manual')),
  trigger_config JSONB NOT NULL,
  conditions JSONB,
  actions JSONB NOT NULL,
  max_executions INT,
  execution_count INT DEFAULT 0,
  last_executed_at TIMESTAMP WITH TIME ZONE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_board_id ON task_automation_rules(board_id) WHERE deleted_at IS NULL AND is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger_type ON task_automation_rules(trigger_type) WHERE deleted_at IS NULL AND is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_automation_rules_branch_id ON task_automation_rules(branch_id) WHERE deleted_at IS NULL;

-- 4. Task Automation Logs
CREATE TABLE IF NOT EXISTS task_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES task_automation_rules(id) ON DELETE SET NULL,
  task_id UUID REFERENCES task_items(id) ON DELETE SET NULL,
  workflow_instance_id UUID REFERENCES task_workflow_instances(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL,
  trigger_data JSONB,
  actions_performed JSONB,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial_success', 'failed')),
  error_message TEXT,
  created_task_ids JSONB,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  execution_duration_ms INT
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_rule_id ON task_automation_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_task_id ON task_automation_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_executed_at ON task_automation_logs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_status ON task_automation_logs(status);

-- 5. Task Notifications
CREATE TABLE IF NOT EXISTS task_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES task_items(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('email', 'sms', 'in_app', 'push')),
  recipient_id TEXT NOT NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  subject TEXT,
  body TEXT NOT NULL,
  template_name TEXT,
  template_data JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_task_notifications_status ON task_notifications(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_task_notifications_recipient ON task_notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_task_notifications_task_id ON task_notifications(task_id);

