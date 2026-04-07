-- Migration: Create EBITDA mapping tables
-- This migration creates tables for mapping Ramp categories and vendors to EBITDA categories

-- Table: ebitda_category_mappings
CREATE TABLE IF NOT EXISTS ebitda_category_mappings (
    id SERIAL PRIMARY KEY,
    ramp_category VARCHAR(255) NOT NULL,
    ebitda_category VARCHAR(50) NOT NULL CHECK (ebitda_category IN ('COGS', 'OPERATING_EXPENSE', 'NON_EBITDA')),
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ebitda_category_mappings_category ON ebitda_category_mappings(ramp_category);
CREATE INDEX IF NOT EXISTS idx_ebitda_category_mappings_effective ON ebitda_category_mappings(effective_from, effective_to);

-- Table: ebitda_vendor_overrides
CREATE TABLE IF NOT EXISTS ebitda_vendor_overrides (
    id SERIAL PRIMARY KEY,
    vendor_name VARCHAR(255) NOT NULL,
    ebitda_category VARCHAR(50) NOT NULL CHECK (ebitda_category IN ('COGS', 'OPERATING_EXPENSE', 'NON_EBITDA')),
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ebitda_vendor_overrides_vendor ON ebitda_vendor_overrides(vendor_name);
CREATE INDEX IF NOT EXISTS idx_ebitda_vendor_overrides_effective ON ebitda_vendor_overrides(effective_from, effective_to);
