-- Migration: Add template deletion protection
-- Date: 2026-01-05
-- Purpose: Prevent accidental template deletion with soft delete and audit logging

-- 1. Add soft delete column to templates table
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Add deleted_by column to track who deleted
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS deleted_by TEXT DEFAULT NULL;

-- 3. Create audit log table for template changes
CREATE TABLE IF NOT EXISTS template_audit_log (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL,
    template_name TEXT NOT NULL,
    action TEXT NOT NULL, -- 'created', 'updated', 'deleted', 'restored'
    performed_by TEXT,
    performed_at TIMESTAMPTZ DEFAULT NOW(),
    details JSONB DEFAULT '{}'
);

-- 4. Create index for efficient queries on non-deleted templates
CREATE INDEX IF NOT EXISTS idx_templates_not_deleted
ON templates (id)
WHERE deleted_at IS NULL;

-- 5. Create index for audit log queries
CREATE INDEX IF NOT EXISTS idx_template_audit_log_template_id
ON template_audit_log (template_id);

CREATE INDEX IF NOT EXISTS idx_template_audit_log_performed_at
ON template_audit_log (performed_at DESC);

-- 6. Add comments for documentation
COMMENT ON COLUMN templates.deleted_at IS 'Soft delete timestamp - NULL means not deleted';
COMMENT ON COLUMN templates.deleted_by IS 'Email/name of user who deleted the template';
COMMENT ON TABLE template_audit_log IS 'Audit trail for all template changes';
