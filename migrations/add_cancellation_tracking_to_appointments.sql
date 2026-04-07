-- Add cancellation tracking columns to appointments table
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(30) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS cancellation_note TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ DEFAULT NULL;

-- Index for filtering cancelled lessons by attribution
CREATE INDEX IF NOT EXISTS idx_appointments_cancelled_by
ON appointments (cancelled_by)
WHERE cancelled_by IS NOT NULL;

-- Index for cancellation report date range queries
CREATE INDEX IF NOT EXISTS idx_appointments_cancelled_at
ON appointments (cancelled_at DESC)
WHERE cancelled_at IS NOT NULL;

COMMENT ON COLUMN appointments.cancelled_by IS 'Who initiated the cancellation: client, tutor, admin, unknown';
COMMENT ON COLUMN appointments.cancellation_reason IS 'Why cancelled: rescheduled, no_show, sick, schedule_conflict, weather, other';
COMMENT ON COLUMN appointments.cancellation_note IS 'Optional freetext note about the cancellation';
COMMENT ON COLUMN appointments.cancelled_at IS 'When the cancellation was recorded/tagged in OpsHub';
