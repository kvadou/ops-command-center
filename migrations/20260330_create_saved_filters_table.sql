-- Migration: Create saved filters table for Data Center
CREATE TABLE IF NOT EXISTS data_center_saved_filters (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    entity_key VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}',
    visible_columns JSONB,
    sort_by VARCHAR(50),
    sort_dir VARCHAR(4) DEFAULT 'ASC',
    is_shared BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dc_saved_filters_user ON data_center_saved_filters(user_id);
CREATE INDEX IF NOT EXISTS idx_dc_saved_filters_entity ON data_center_saved_filters(entity_key);
