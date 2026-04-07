-- Migration: Create club_students association table
-- Date: 2026-02-24
-- Idempotent: Safe to run multiple times (IF NOT EXISTS, ON CONFLICT DO NOTHING)

CREATE TABLE IF NOT EXISTS club_students (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  recipient_id INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'trial', 'inactive', 'graduated')),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  last_attended TIMESTAMPTZ,
  sessions_attended INTEGER DEFAULT 0,
  membership_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(club_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_club_students_club_id ON club_students(club_id);
CREATE INDEX IF NOT EXISTS idx_club_students_recipient_id ON club_students(recipient_id);
CREATE INDEX IF NOT EXISTS idx_club_students_status ON club_students(status);
