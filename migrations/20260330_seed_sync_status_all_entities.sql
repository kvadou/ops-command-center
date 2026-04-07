-- Migration: Seed sync_status with all TC entity types for Data Center health tracking
-- The sync_status table already has: services, appointments, invoices, payment_orders
-- This adds the remaining entities so the Data Center can track sync freshness for all.

INSERT INTO sync_status (sync_type, last_sync) VALUES
    ('clients', NOW()),
    ('contractors', NOW()),
    ('adhoc_charges', NOW()),
    ('proforma_invoices', NOW()),
    ('recipients', NOW()),
    ('reviews', NOW())
ON CONFLICT (sync_type) DO NOTHING;
