-- Calendar Performance Optimization Indexes
-- Generated: 2025-01-XX
-- Purpose: Optimize calendar view queries for faster appointment loading

-- =============================================================================
-- CALENDAR-SPECIFIC COMPOSITE INDEXES
-- =============================================================================

-- Optimize calendar date range queries with status filtering
-- This index covers the most common calendar query pattern: date range + status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_calendar_start_status 
ON appointments (start, status) 
WHERE start IS NOT NULL;

-- Optimize calendar queries with service filtering
-- Covers date range + service_id queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_calendar_start_service 
ON appointments (start, service_id) 
WHERE start IS NOT NULL;

-- Optimize calendar queries with both service and status
-- Covers the most complex calendar filter combinations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_calendar_start_service_status 
ON appointments (start, service_id, status) 
WHERE start IS NOT NULL;

-- Optimize appointment_contractors joins for calendar filtering
-- Composite index for contractor_id + appointment_id lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointment_contractors_calendar 
ON appointment_contractors (contractor_id, appointment_id);

-- Optimize appointment_recipients joins for calendar filtering
-- Composite index for recipient_id + paying_client_id + appointment_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointment_recipients_calendar 
ON appointment_recipients (recipient_id, paying_client_id, appointment_id);

-- =============================================================================
-- STATISTICS UPDATE
-- =============================================================================

-- Update table statistics for better query planning
ANALYZE appointments;
ANALYZE appointment_contractors;
ANALYZE appointment_recipients;











