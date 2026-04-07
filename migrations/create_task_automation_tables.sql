-- Task Automation System Tables
-- Comprehensive automation infrastructure for task management

-- 1. Task Dependencies Table
-- Defines blocking relationships between tasks
CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationship
  task_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE, -- the task that is blocked
  depends_on_task_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE, -- the task that must be completed first
  
  -- Dependency type
  dependency_type TEXT NOT NULL DEFAULT 'finish_to_start' CHECK (dependency_type IN ('finish_to_start', 'start_to_start', 'finish_to_finish')),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT, -- user id or email
  
  -- Prevent circular dependencies and duplicates
  CONSTRAINT no_self_dependency CHECK (task_id != depends_on_task_id),
  CONSTRAINT unique_dependency UNIQUE (task_id, depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id);

-- 2. Task Workflow Templates Table
-- Pre-built workflow templates that can be instantiated
CREATE TABLE IF NOT EXISTS task_workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Template info
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- e.g., 'franchise_onboarding', 'event_setup', 'marketing_campaign'
  icon TEXT, -- emoji or icon name
  
  -- Template structure (JSON array of task definitions)
  template_data JSONB NOT NULL, -- Array of {name, description, group, position, priority, due_days_offset, assignee_role, dependencies, tags}
  
  -- Default board settings
  default_board_name TEXT,
  default_groups JSONB, -- Array of group names if creating new board
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  is_system_template BOOLEAN DEFAULT false, -- system templates can't be deleted
  branch_id TEXT, -- NULL for global templates
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_category ON task_workflow_templates(category) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_workflow_templates_branch ON task_workflow_templates(branch_id) WHERE deleted_at IS NULL;

-- 3. Task Workflow Instances Table
-- Track active workflow executions
CREATE TABLE IF NOT EXISTS task_workflow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Workflow info
  template_id UUID REFERENCES task_workflow_templates(id),
  board_id UUID NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
  
  -- Execution context
  context_data JSONB, -- Variables used during instantiation (e.g., {client_name, tutor_name, start_date})
  created_task_ids JSONB, -- Array of task IDs created by this workflow
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'failed')),
  completed_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  
  -- Metadata
  executed_by TEXT NOT NULL, -- user id or email
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_board_id ON task_workflow_instances(board_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_template_id ON task_workflow_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON task_workflow_instances(status);

-- 4. Task Automation Rules Table
-- Defines automation rules (trigger -> conditions -> actions)
CREATE TABLE IF NOT EXISTS task_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Rule info
  name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT true,
  
  -- Scope
  board_id UUID REFERENCES task_boards(id) ON DELETE CASCADE, -- NULL for global rules
  branch_id TEXT, -- NULL for all branches
  
  -- Trigger configuration
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'status_change', 
    'date_based', 
    'external_event', 
    'manual'
  )),
  trigger_config JSONB NOT NULL, -- Configuration specific to trigger type
  -- Examples:
  -- status_change: {from_status: 'in_progress', to_status: 'done'}
  -- date_based: {schedule: 'daily', time: '09:00', days_offset: 7, relative_to: 'due_date'}
  -- external_event: {event_type: 'booking_submission', filters: {...}}
  
  -- Conditions (optional filters)
  conditions JSONB, -- Array of conditions that must be met
  -- Example: [{field: 'priority', operator: 'equals', value: 'urgent'}, {field: 'tags', operator: 'contains', value: 'client'}]
  
  -- Actions to perform
  actions JSONB NOT NULL, -- Array of actions to execute
  -- Example: [
  --   {type: 'create_task', config: {name: 'Follow up', group_id: '...', due_days: 7}},
  --   {type: 'send_notification', config: {to: 'assignee', template: 'task_completed'}},
  --   {type: 'update_field', config: {field: 'priority', value: 'low'}}
  -- ]
  
  -- Execution limits
  max_executions INT, -- NULL for unlimited
  execution_count INT DEFAULT 0,
  last_executed_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_board_id ON task_automation_rules(board_id) WHERE deleted_at IS NULL AND is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger_type ON task_automation_rules(trigger_type) WHERE deleted_at IS NULL AND is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_automation_rules_branch_id ON task_automation_rules(branch_id) WHERE deleted_at IS NULL;

-- 5. Task Automation Logs Table
-- Audit trail for automation executions
CREATE TABLE IF NOT EXISTS task_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference
  rule_id UUID REFERENCES task_automation_rules(id) ON DELETE SET NULL,
  task_id UUID REFERENCES task_items(id) ON DELETE SET NULL,
  workflow_instance_id UUID REFERENCES task_workflow_instances(id) ON DELETE SET NULL,
  
  -- Execution details
  trigger_type TEXT NOT NULL,
  trigger_data JSONB, -- Data that triggered the automation
  actions_performed JSONB, -- Array of actions that were executed
  
  -- Result
  status TEXT NOT NULL CHECK (status IN ('success', 'partial_success', 'failed')),
  error_message TEXT,
  created_task_ids JSONB, -- Array of task IDs created by this execution
  
  -- Metadata
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  execution_duration_ms INT
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_rule_id ON task_automation_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_task_id ON task_automation_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_executed_at ON task_automation_logs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_status ON task_automation_logs(status);

-- 6. Task Notifications Queue Table
-- Queue for outbound notifications (email, SMS, in-app)
CREATE TABLE IF NOT EXISTS task_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Notification details
  task_id UUID REFERENCES task_items(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('email', 'sms', 'in_app', 'push')),
  
  -- Recipients
  recipient_id TEXT NOT NULL, -- user id or email
  recipient_email TEXT,
  recipient_phone TEXT,
  
  -- Content
  subject TEXT,
  body TEXT NOT NULL,
  template_name TEXT,
  template_data JSONB,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  
  -- Scheduling
  scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT -- automation rule or user that created notification
);

CREATE INDEX IF NOT EXISTS idx_task_notifications_status ON task_notifications(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_task_notifications_recipient ON task_notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_task_notifications_task_id ON task_notifications(task_id);

-- Comments
COMMENT ON TABLE task_dependencies IS 'Defines blocking relationships between tasks';
COMMENT ON TABLE task_workflow_templates IS 'Pre-built workflow templates that can be instantiated to create task sequences';
COMMENT ON TABLE task_workflow_instances IS 'Tracks active workflow executions and their created tasks';
COMMENT ON TABLE task_automation_rules IS 'Automation rules that trigger actions based on events or conditions';
COMMENT ON TABLE task_automation_logs IS 'Audit trail for all automation executions';
COMMENT ON TABLE task_notifications IS 'Queue for outbound task notifications (email, SMS, in-app)';

