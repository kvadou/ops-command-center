-- Migration: Create e4_data and mindbody_data tables
-- These tables store historical data from e4.csv and MB.csv for operations team use

-- Table: e4_data
-- Stores all historical e4 lesson data
CREATE TABLE IF NOT EXISTS e4_data (
    id SERIAL PRIMARY KEY,
    tutor_pay_legacy VARCHAR(255),
    tutor_pay_new VARCHAR(255),
    lesson_charged_amt VARCHAR(255),
    students_per_lesson INTEGER,
    students_attended INTEGER,
    lesson_revenue VARCHAR(255),
    lesson_date DATE,
    lesson_length INTEGER,
    lesson_location VARCHAR(255),
    tutor_confirmation_date DATE,
    tutor_id INTEGER,
    class_division VARCHAR(255),
    curriculum VARCHAR(255),
    lesson_status VARCHAR(100),
    clients TEXT,
    client_email VARCHAR(255),
    client_phone VARCHAR(255),
    pricing_profile TEXT,
    pricing_profile_id INTEGER,
    one_student_price VARCHAR(255),
    lesson_net_amount VARCHAR(255),
    tutor_pay VARCHAR(255),
    lesson_time TIME,
    division VARCHAR(255),
    attendance_rate DECIMAL(5, 4),
    lessons_based_on_1hr DECIMAL(10, 4),
    tutor VARCHAR(255),
    tutor_lesson_to_checkout_days INTEGER,
    gross_profit VARCHAR(255),
    gross_margin VARCHAR(255),
    month VARCHAR(255),
    day VARCHAR(255),
    month_num INTEGER,
    week_data VARCHAR(255),
    day_of_week_number INTEGER,
    time VARCHAR(255),
    dow_day VARCHAR(255),
    time_type VARCHAR(255),
    day_type VARCHAR(255),
    day_and_time_type VARCHAR(255),
    day_time VARCHAR(255),
    month_week VARCHAR(255),
    raw_data JSONB, -- Store all original CSV data as JSON for reference
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_e4_data_lesson_date ON e4_data(lesson_date);
CREATE INDEX IF NOT EXISTS idx_e4_data_tutor_id ON e4_data(tutor_id);
CREATE INDEX IF NOT EXISTS idx_e4_data_lesson_status ON e4_data(lesson_status);
CREATE INDEX IF NOT EXISTS idx_e4_data_client_email ON e4_data(client_email);
CREATE INDEX IF NOT EXISTS idx_e4_data_lesson_location ON e4_data(lesson_location);
CREATE INDEX IF NOT EXISTS idx_e4_data_division ON e4_data(division);
CREATE INDEX IF NOT EXISTS idx_e4_data_tutor ON e4_data(tutor);

-- Table: mindbody_data
-- Stores all historical MindBody lesson data
CREATE TABLE IF NOT EXISTS mindbody_data (
    id SERIAL PRIMARY KEY,
    staff_paid VARCHAR(50),
    date DATE,
    day VARCHAR(50),
    time TIME,
    client_id VARCHAR(100),
    client TEXT,
    lesson_type VARCHAR(255),
    staff VARCHAR(255),
    late_cancel VARCHAR(50),
    no_show VARCHAR(50),
    payment_method VARCHAR(255),
    rev_per_visit VARCHAR(50),
    visit_service_category VARCHAR(255),
    class_size INTEGER,
    hrs DECIMAL(10, 4),
    dashboard_category VARCHAR(255),
    focus VARCHAR(255),
    location VARCHAR(255),
    raw_data JSONB, -- Store all original CSV data as JSON for reference
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_mindbody_data_date ON mindbody_data(date);
CREATE INDEX IF NOT EXISTS idx_mindbody_data_client_id ON mindbody_data(client_id);
CREATE INDEX IF NOT EXISTS idx_mindbody_data_lesson_type ON mindbody_data(lesson_type);
CREATE INDEX IF NOT EXISTS idx_mindbody_data_staff ON mindbody_data(staff);
CREATE INDEX IF NOT EXISTS idx_mindbody_data_location ON mindbody_data(location);
CREATE INDEX IF NOT EXISTS idx_mindbody_data_dashboard_category ON mindbody_data(dashboard_category);

-- Add comments
COMMENT ON TABLE e4_data IS 'Stores historical e4 lesson data from CSV import for operations team use';
COMMENT ON TABLE mindbody_data IS 'Stores historical MindBody lesson data from CSV import for operations team use';

