-- Migration: Create Historical Data Tables
-- This migration creates tables to store historical lesson/appointment data
-- from MindBody, e4, and TutorCruncher systems

-- Main historical appointments table
CREATE TABLE IF NOT EXISTS historical_appointments (
  id SERIAL PRIMARY KEY,
  
  -- Source System Tracking
  source_system VARCHAR(50) NOT NULL CHECK (source_system IN ('mindbody', 'e4', 'tutorcruncher')),
  source_id VARCHAR(255), -- Original ID from source system
  
  -- Appointment Details
  appointment_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  start_timestamp TIMESTAMP WITH TIME ZONE,
  end_timestamp TIMESTAMP WITH TIME ZONE,
  duration_hours DECIMAL(10, 2),
  duration_minutes INTEGER,
  units DECIMAL(10, 2),
  
  -- Status and Classification
  status VARCHAR(100), -- 'complete', 'completed', 'cancelled', 'pending', etc.
  lesson_type VARCHAR(255), -- Service/lesson type name
  curriculum VARCHAR(100), -- 'Chess', 'Music', etc.
  division VARCHAR(100), -- 'In-Home', 'Online', 'School', 'Retail', etc.
  class_division VARCHAR(255), -- More detailed division from e4
  
  -- Location
  location VARCHAR(255),
  location_category VARCHAR(100), -- 'Other', 'New York', 'Los Angeles', etc.
  
  -- Financial Data
  revenue DECIMAL(10, 2),
  tutor_pay DECIMAL(10, 2),
  tutor_pay_legacy DECIMAL(10, 2), -- For e4 system
  tutor_pay_new DECIMAL(10, 2), -- For e4 system
  gross_profit DECIMAL(10, 2),
  gross_margin DECIMAL(5, 2), -- Percentage
  charge_rate DECIMAL(10, 2),
  lesson_net_amount DECIMAL(10, 2),
  
  -- Attendance and Class Info
  class_size INTEGER,
  students_scheduled INTEGER,
  students_attended INTEGER,
  attendance_rate DECIMAL(5, 2),
  
  -- Flags
  late_cancel BOOLEAN,
  no_show BOOLEAN,
  staff_paid BOOLEAN,
  
  -- Payment Info
  payment_method VARCHAR(255),
  
  -- Labels and Categories (stored as JSONB for flexibility)
  labels JSONB, -- Array of label strings
  dashboard_category VARCHAR(100),
  focus VARCHAR(100),
  visit_service_category VARCHAR(100),
  
  -- Pricing Info
  pricing_profile VARCHAR(255),
  pricing_profile_id INTEGER,
  one_student_price DECIMAL(10, 2),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicate imports
  UNIQUE(source_system, source_id)
);

-- Historical appointment tutors table (supports multiple tutors per appointment)
CREATE TABLE IF NOT EXISTS historical_appointment_tutors (
  id SERIAL PRIMARY KEY,
  historical_appointment_id INTEGER NOT NULL REFERENCES historical_appointments(id) ON DELETE CASCADE,
  
  tutor_id VARCHAR(255), -- Original tutor ID from source system
  tutor_name VARCHAR(255), -- "Last, First" format
  tutor_first_name VARCHAR(255),
  tutor_last_name VARCHAR(255),
  pay_rate DECIMAL(10, 2),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Historical appointment clients/students table (supports multiple clients/students per appointment)
CREATE TABLE IF NOT EXISTS historical_appointment_clients (
  id SERIAL PRIMARY KEY,
  historical_appointment_id INTEGER NOT NULL REFERENCES historical_appointments(id) ON DELETE CASCADE,
  
  client_id VARCHAR(255), -- Original client ID from source system
  client_name VARCHAR(255),
  client_email VARCHAR(255),
  client_phone VARCHAR(255),
  
  student_id VARCHAR(255), -- Student ID if different from client
  student_name VARCHAR(255),
  attendance_status VARCHAR(100), -- 'attended', 'did not attend', 'missed-chargeable', etc.
  charge_rate DECIMAL(10, 2),
  
  -- Agent/Commission info (for TutorCruncher)
  agent_name VARCHAR(255),
  agent_percentage DECIMAL(5, 2),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Historical clients master table (deduplicated across systems)
CREATE TABLE IF NOT EXISTS historical_clients (
  id SERIAL PRIMARY KEY,
  
  -- Source System IDs (can have multiple)
  mindbody_client_id VARCHAR(255),
  e4_client_id VARCHAR(255),
  tutorcruncher_client_id VARCHAR(255),
  
  -- Client Info
  client_name VARCHAR(255),
  client_email VARCHAR(255),
  client_phone VARCHAR(255),
  
  -- First and Last Lesson Dates
  first_lesson_date DATE,
  last_lesson_date DATE,
  
  -- Total Stats (can be calculated)
  total_lessons INTEGER DEFAULT 0,
  total_revenue DECIMAL(10, 2) DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_historical_appointments_date ON historical_appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_historical_appointments_date_range ON historical_appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_historical_appointments_source ON historical_appointments(source_system, source_id);
CREATE INDEX IF NOT EXISTS idx_historical_appointments_status ON historical_appointments(status);
CREATE INDEX IF NOT EXISTS idx_historical_appointments_division ON historical_appointments(division);
CREATE INDEX IF NOT EXISTS idx_historical_appointments_source_system ON historical_appointments(source_system);
CREATE INDEX IF NOT EXISTS idx_historical_appointments_start_timestamp ON historical_appointments(start_timestamp);

CREATE INDEX IF NOT EXISTS idx_historical_appointment_tutors_appointment ON historical_appointment_tutors(historical_appointment_id);
CREATE INDEX IF NOT EXISTS idx_historical_appointment_tutors_tutor ON historical_appointment_tutors(tutor_id);
CREATE INDEX IF NOT EXISTS idx_historical_appointment_tutors_name ON historical_appointment_tutors(tutor_name);

CREATE INDEX IF NOT EXISTS idx_historical_appointment_clients_appointment ON historical_appointment_clients(historical_appointment_id);
CREATE INDEX IF NOT EXISTS idx_historical_appointment_clients_client ON historical_appointment_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_historical_appointment_clients_email ON historical_appointment_clients(client_email);
CREATE INDEX IF NOT EXISTS idx_historical_appointment_clients_phone ON historical_appointment_clients(client_phone);

CREATE INDEX IF NOT EXISTS idx_historical_clients_mindbody ON historical_clients(mindbody_client_id);
CREATE INDEX IF NOT EXISTS idx_historical_clients_e4 ON historical_clients(e4_client_id);
CREATE INDEX IF NOT EXISTS idx_historical_clients_tc ON historical_clients(tutorcruncher_client_id);
CREATE INDEX IF NOT EXISTS idx_historical_clients_email ON historical_clients(client_email);
CREATE INDEX IF NOT EXISTS idx_historical_clients_phone ON historical_clients(client_phone);

-- Create partial unique indexes for source system IDs (only when not NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_historical_clients_mindbody_unique 
ON historical_clients(mindbody_client_id) WHERE mindbody_client_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_historical_clients_e4_unique 
ON historical_clients(e4_client_id) WHERE e4_client_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_historical_clients_tc_unique 
ON historical_clients(tutorcruncher_client_id) WHERE tutorcruncher_client_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE historical_appointments IS 'Stores historical lesson/appointment data from MindBody, e4, and TutorCruncher systems';
COMMENT ON TABLE historical_appointment_tutors IS 'Stores tutor information for historical appointments (supports multiple tutors per appointment)';
COMMENT ON TABLE historical_appointment_clients IS 'Stores client/student information for historical appointments (supports multiple clients/students per appointment)';
COMMENT ON TABLE historical_clients IS 'Deduplicated client master list across all historical systems';

