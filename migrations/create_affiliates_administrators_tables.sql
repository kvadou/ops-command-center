-- Migration: Create affiliates and administrators tables
-- This migration creates tables for managing affiliates and administrators in the Operations Hub

-- 1. Affiliates Table
CREATE TABLE IF NOT EXISTS affiliates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active', -- active, inactive
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for affiliates
CREATE INDEX IF NOT EXISTS idx_affiliates_name ON affiliates(name);
CREATE INDEX IF NOT EXISTS idx_affiliates_email ON affiliates(email);
CREATE INDEX IF NOT EXISTS idx_affiliates_status ON affiliates(status);
CREATE INDEX IF NOT EXISTS idx_affiliates_date_created ON affiliates(date_created);

-- Add comments to document the table purpose
COMMENT ON TABLE affiliates IS 'Stores affiliate information for the Operations Hub';
COMMENT ON COLUMN affiliates.status IS 'Affiliate status: active or inactive';

-- 2. Administrators Table
CREATE TABLE IF NOT EXISTS administrators (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'admin', -- admin, staff, etc.
    status VARCHAR(50) DEFAULT 'active', -- active, inactive
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for administrators
CREATE INDEX IF NOT EXISTS idx_administrators_email ON administrators(email);
CREATE INDEX IF NOT EXISTS idx_administrators_role ON administrators(role);
CREATE INDEX IF NOT EXISTS idx_administrators_status ON administrators(status);
CREATE INDEX IF NOT EXISTS idx_administrators_last_login ON administrators(last_login);
CREATE INDEX IF NOT EXISTS idx_administrators_first_name ON administrators(first_name);
CREATE INDEX IF NOT EXISTS idx_administrators_last_name ON administrators(last_name);

-- Add comments to document the table purpose
COMMENT ON TABLE administrators IS 'Stores administrator information for the Operations Hub';
COMMENT ON COLUMN administrators.role IS 'Administrator role: admin, staff, etc.';
COMMENT ON COLUMN administrators.status IS 'Administrator status: active or inactive';

