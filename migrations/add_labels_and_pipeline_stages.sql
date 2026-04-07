-- Create normalized storage for TutorCruncher Labels and Pipeline Stages
-- Also add junction table to associate Services with Labels

BEGIN;

CREATE TABLE IF NOT EXISTS labels (
    id                 INTEGER PRIMARY KEY,
    name               VARCHAR(255) NOT NULL,
    color              VARCHAR(64),
    active             BOOLEAN DEFAULT TRUE,
    remote_last_updated TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_name ON labels (LOWER(name));

CREATE TABLE IF NOT EXISTS pipeline_stages (
    id                 INTEGER PRIMARY KEY,
    name               VARCHAR(255) NOT NULL,
    pipeline           VARCHAR(255),
    order_index        INTEGER,
    active             BOOLEAN DEFAULT TRUE,
    remote_last_updated TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_labels (
    service_id         INTEGER NOT NULL,
    label_id           INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (service_id, label_id)
);

-- Foreign key to services if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'services'
  ) THEN
    ALTER TABLE service_labels
    ADD CONSTRAINT fk_service_labels_services
    FOREIGN KEY (service_id) REFERENCES services(service_id)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

COMMIT;


