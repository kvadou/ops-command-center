-- Backfill: Set status to 'dormant' for all clients marked as Lost
-- who still have status = 'prospect' or 'archived' instead of 'dormant'
--
-- This fixes clients that were marked Lost before the code fix that
-- properly sets status = 'dormant' in updateProspectStatus()
--
-- Safe to run multiple times (idempotent)

UPDATE clients
SET status = 'dormant',
    updated_at = NOW()
WHERE prospect_status = 'Lost'
  AND status != 'dormant';
