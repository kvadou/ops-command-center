-- Migration: Fix client_reports unique constraint
-- Problem: The current unique constraint (appointment_id, client_email) prevents multiple reports 
-- for the same appointment when students share a client (e.g., school lessons where all students 
-- have the same paying client/school).
-- Solution: Change the constraint to (appointment_id, student_name) to allow one report per student
-- per appointment, which matches the code's duplicate-checking logic.

-- Step 1: Drop the old constraint
DROP INDEX IF EXISTS idx_client_reports_appointment_client_unique;

-- Step 2: Create the new constraint on (appointment_id, student_name)
CREATE UNIQUE INDEX idx_client_reports_appointment_student_unique 
ON client_reports (appointment_id, student_name) 
WHERE appointment_id IS NOT NULL AND student_name IS NOT NULL;

-- Add a comment explaining the constraint
COMMENT ON INDEX idx_client_reports_appointment_student_unique IS 
'Ensures only one report per appointment per student. This allows multiple reports for the same 
appointment when students share a paying client (e.g., school lessons), while still preventing 
duplicate reports for the same student.';
