-- Performance Optimization Indexes
-- Generated: 2025-10-05
-- Purpose: Optimize complex queries for revenue reports and appointment lookups

-- =============================================================================
-- APPOINTMENTS TABLE INDEXES
-- =============================================================================

-- Critical for date range queries in revenue reports
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_start_status 
ON appointments (start, status) 
WHERE status IN ('complete', 'cancelled-chargeable');

-- Optimize service-based appointment lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_service_start 
ON appointments (service_id, start);

-- Optimize appointment ID lookups (used in joins)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_appointment_id 
ON appointments (appointment_id);

-- Optimize date-based filtering for sync operations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_updated_at 
ON appointments (updated_at) 
WHERE updated_at IS NOT NULL;

-- =============================================================================
-- APPOINTMENT_RECIPIENTS TABLE INDEXES
-- =============================================================================

-- Critical for status filtering in revenue calculations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointment_recipients_status 
ON appointment_recipients (status) 
WHERE status <> 'missed';

-- Optimize appointment-based lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointment_recipients_appointment_id 
ON appointment_recipients (appointment_id);

-- Optimize recipient-based lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointment_recipients_recipient_id 
ON appointment_recipients (recipient_id);

-- Optimize paying client lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointment_recipients_paying_client_id 
ON appointment_recipients (paying_client_id);

-- =============================================================================
-- APPOINTMENT_CONTRACTORS TABLE INDEXES
-- =============================================================================

-- Optimize appointment-based contractor lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointment_contractors_appointment_id 
ON appointment_contractors (appointment_id);

-- Optimize contractor-based lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointment_contractors_contractor_id 
ON appointment_contractors (contractor_id);

-- =============================================================================
-- SERVICES TABLE INDEXES
-- =============================================================================

-- Optimize JSONB labels queries (critical for service filtering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_labels_gin 
ON services USING GIN (labels);

-- Optimize location-based service lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_location 
ON services (location);

-- Optimize service ID lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_service_id 
ON services (service_id);

-- =============================================================================
-- CLIENTS TABLE INDEXES
-- =============================================================================

-- Optimize client lookups by ID
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_id 
ON clients (id);

-- Optimize email-based client lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_email 
ON clients (email);

-- =============================================================================
-- BOOKING_SUBMISSIONS TABLE INDEXES
-- =============================================================================

-- Optimize recent submissions queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_booking_submissions_created_at 
ON booking_submissions (created_at DESC);

-- Optimize payment status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_booking_submissions_payment_status 
ON booking_submissions (payment_status);

-- Optimize label-based filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_booking_submissions_label_id 
ON booking_submissions (label_id);

-- =============================================================================
-- PAYMENT_ORDERS TABLE INDEXES
-- =============================================================================

-- Optimize payment order lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_orders_id 
ON payment_orders (id);

-- Optimize date-based payment queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_orders_date_sent 
ON payment_orders (date_sent);

-- Optimize payee-based lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_orders_payee_id 
ON payment_orders (payee_id);

-- =============================================================================
-- PAYMENT_ORDER_CHARGES TABLE INDEXES
-- =============================================================================

-- Optimize appointment-based charge lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_order_charges_appointment_id 
ON payment_order_charges (appointment_id);

-- Optimize payment order-based charge lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_order_charges_payment_order_id 
ON payment_order_charges (payment_order_id);

-- Optimize date-based charge queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_order_charges_date 
ON payment_order_charges (date);

-- =============================================================================
-- COMPOSITE INDEXES FOR COMPLEX QUERIES
-- =============================================================================

-- Optimize the complex revenue calculation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_complete_date_service 
ON appointments (status, start, service_id) 
WHERE status IN ('complete', 'cancelled-chargeable');

-- Optimize appointment recipient status filtering with appointment joins
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointment_recipients_appointment_status 
ON appointment_recipients (appointment_id, status) 
WHERE status <> 'missed';

-- Optimize service labels with location filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_location_labels 
ON services (location) 
WHERE labels IS NOT NULL;

-- =============================================================================
-- PARTIAL INDEXES FOR COMMON FILTERS
-- =============================================================================

-- Optimize active appointments only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_active_start 
ON appointments (start) 
WHERE status IN ('complete', 'cancelled-chargeable', 'confirmed');

-- Optimize recent appointments (last 30 days)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_recent_start 
ON appointments (start DESC) 
WHERE start >= NOW() - INTERVAL '30 days';

-- Optimize pending bookings
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_booking_submissions_pending 
ON booking_submissions (created_at DESC) 
WHERE payment_status = 'pending';

-- =============================================================================
-- STATISTICS UPDATE
-- =============================================================================

-- Update table statistics for better query planning
ANALYZE appointments;
ANALYZE appointment_recipients;
ANALYZE appointment_contractors;
ANALYZE services;
ANALYZE clients;
ANALYZE booking_submissions;
ANALYZE payment_orders;
ANALYZE payment_order_charges;

-- =============================================================================
-- INDEX USAGE MONITORING
-- =============================================================================

-- Create a view to monitor index usage
CREATE OR REPLACE VIEW index_usage_stats AS
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    CASE 
        WHEN idx_tup_read > 0 
        THEN ROUND((idx_tup_fetch::numeric / idx_tup_read::numeric) * 100, 2)
        ELSE 0 
    END as hit_ratio_percent
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
ORDER BY idx_tup_read DESC;

-- Create a view to identify unused indexes
CREATE OR REPLACE VIEW unused_indexes AS
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
    AND idx_tup_read = 0
    AND indexname NOT LIKE '%_pkey'
ORDER BY tablename, indexname;
