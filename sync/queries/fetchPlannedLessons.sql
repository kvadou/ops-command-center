-- Fetch planned lessons for ETL sync
-- Returns planned lessons with expected revenue calculation
-- Used for pipeline forecasting

SELECT 
    DATE(a.start) AS planned_date,
    COALESCE(SUM(
        CASE
            WHEN s.dft_charge_type = 'hourly' THEN ar.charge_rate * a.units
            WHEN s.dft_charge_type = 'one-off' THEN ar.charge_rate
            WHEN s.dft_charge_type = 'one-off-split' THEN ar.charge_rate
            WHEN s.dft_charge_type = 'hourly-split' THEN ar.charge_rate * a.units
            ELSE ar.charge_rate * a.units
        END
    ), 0) AS potential_revenue,
    COUNT(DISTINCT a.appointment_id) AS planned_lessons,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.labels) AS lbl 
            WHERE lbl LIKE '%NYC%'
        ) THEN 'NYC'
        WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.labels) AS lbl 
            WHERE lbl LIKE '%LA%'
        ) THEN 'LA'
        WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.labels) AS lbl 
            WHERE lbl LIKE '%SF%'
        ) THEN 'SF'
        WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.labels) AS lbl 
            WHERE lbl LIKE '%Hamptons%'
        ) THEN 'Hamptons'
        WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.labels) AS lbl 
            WHERE lbl LIKE '%Westchester%'
        ) THEN 'Westchester'
        ELSE NULL
    END AS market,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.labels) AS lbl 
            WHERE lbl LIKE '%Home%'
        ) THEN 'Home'
        WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.labels) AS lbl 
            WHERE lbl LIKE '%School%'
        ) THEN 'School'
        WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.labels) AS lbl 
            WHERE lbl LIKE '%Club%'
        ) THEN 'Club'
        WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.labels) AS lbl 
            WHERE lbl LIKE '%Online%'
        ) THEN 'Online'
        ELSE NULL
    END AS lesson_type
FROM appointments a
JOIN services s ON a.service_id = s.service_id
LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
    AND ar.status <> 'missed'
WHERE a.status = 'planned'
    AND a.is_deleted IS NOT TRUE
    AND DATE(a.start) >= CURRENT_DATE
    AND DATE(a.start) < (CURRENT_DATE + INTERVAL '90 days')
GROUP BY DATE(a.start), s.labels
ORDER BY planned_date;

