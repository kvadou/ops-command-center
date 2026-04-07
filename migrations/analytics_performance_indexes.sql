-- Analytics Performance Indexes
-- Purpose: Optimize analytics queries for faster dashboard loading
-- Run this migration to add indexes specifically for analytics queries

-- =============================================================================
-- APPOINTMENTS TABLE INDEXES
-- =============================================================================

-- Composite index for common analytics filter pattern:
-- WHERE status IN ('complete','cancelled-chargeable') 
--   AND is_deleted IS NOT TRUE 
--   AND start >= ? AND start < ?
-- This covers most analytics queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_analytics_composite 
ON appointments (start, status, is_deleted) 
WHERE status IN ('complete', 'cancelled-chargeable') AND is_deleted IS NOT TRUE;

-- Index for year-based queries (EXTRACT(YEAR FROM start) = ?)
-- This helps with getLessonsReport, getLessonHoursReport, etc.
-- Note: We can't use EXTRACT directly in index, so we'll use date_trunc instead
-- which is immutable and can be used in WHERE clauses with date ranges
-- The existing idx_appointments_start_status index should cover year-based queries
-- when combined with date range filters

-- Index for service_id joins (used in all analytics queries)
-- Composite with status and start for better join performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_service_analytics 
ON appointments (service_id, status, start) 
WHERE status IN ('complete', 'cancelled-chargeable') AND is_deleted IS NOT TRUE;

-- =============================================================================
-- APPOINTMENT_RECIPIENTS TABLE INDEXES
-- =============================================================================

-- Composite index for appointment_id join with status filter
-- Used in: getStudentsReport, revenue calculations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointment_recipients_appointment_status 
ON appointment_recipients (appointment_id, status) 
WHERE status <> 'missed';

-- =============================================================================
-- APPOINTMENT_CONTRACTORS TABLE INDEXES
-- =============================================================================

-- Ensure index exists for appointment_id joins (used in tutor pay calculations)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointment_contractors_appointment_id 
ON appointment_contractors (appointment_id);

-- =============================================================================
-- ADHOC_CHARGES TABLE INDEXES
-- =============================================================================

-- Composite index for date range queries with appointment_id join
-- Used in: adhoc pay calculations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_adhoc_charges_date_appointment 
ON adhoc_charges (date_occurred, appointment_id) 
WHERE appointment_id IS NOT NULL;

-- =============================================================================
-- SERVICES TABLE INDEXES
-- =============================================================================

-- Ensure GIN index exists for JSONB labels queries (critical for label filtering)
-- This should already exist, but ensure it's there
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_labels_gin 
ON services USING GIN (labels);

-- Index for service_id lookups (used in all joins)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_services_service_id 
ON services (service_id);

-- =============================================================================
-- NOTES
-- =============================================================================
-- 
-- These indexes are optimized for:
-- 1. Date range queries (start >= ? AND start < ?)
-- 2. Status filtering (complete, cancelled-chargeable)
-- 3. is_deleted filtering (IS NOT TRUE)
-- 4. Year-based queries (EXTRACT(YEAR FROM start))
-- 5. Service label filtering (JSONB operations)
-- 6. Join operations (appointment_id, service_id)
--
-- The CONCURRENTLY option allows indexes to be created without locking the table,
-- which is important for production databases.
--
-- To verify indexes were created:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('appointments', 'appointment_recipients', 'appointment_contractors', 'adhoc_charges', 'services') ORDER BY tablename, indexname;

