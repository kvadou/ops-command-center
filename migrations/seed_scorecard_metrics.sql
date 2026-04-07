-- EOS Scorecard Seed Data
-- Inserts initial 8 metrics for the scorecard
-- Idempotent: ON CONFLICT DO NOTHING, safe to run on all 5 databases

INSERT INTO scorecard_metrics (metric_key, display_name, owner, category, goal_value, goal_direction, data_source, computation_key, display_format, sort_order, is_active)
VALUES
    ('weekly_revenue', 'Weekly Revenue', 'Paul Levy', 'Revenue', NULL, 'above', 'auto', 'weekly_revenue', 'currency', 10, TRUE),
    ('weekly_lessons', 'Lessons Completed', 'Sam Williams', 'Operations', NULL, 'above', 'auto', 'weekly_lessons', 'number', 20, TRUE),
    ('weekly_gghs', 'Good Game Handshakes', 'Sam Williams', 'Operations', NULL, 'above', 'auto', 'weekly_gghs', 'number', 30, TRUE),
    ('trials_booked', 'Trials Booked', 'Jamie Parker', 'Sales', NULL, 'above', 'auto', 'trials_booked', 'number', 40, TRUE),
    ('conversions', 'Conversions', 'Jamie Parker', 'Sales', NULL, 'above', 'auto', 'conversions', 'number', 50, TRUE),
    ('prospect_pipeline', 'Active Prospects', 'Jamie Parker', 'Sales', NULL, 'above', 'auto', 'prospect_pipeline', 'number', 60, TRUE),
    ('booking_submissions', 'Booking Submissions', 'Admin User', 'Platform', NULL, 'above', 'auto', 'booking_submissions', 'number', 70, TRUE),
    ('report_completion_pct', 'Report Completion', 'Morgan Davis', 'Quality', NULL, 'above', 'auto', 'report_completion_pct', 'percent', 80, TRUE)
ON CONFLICT (metric_key) DO NOTHING;
