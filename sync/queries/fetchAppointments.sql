-- Fetch completed appointments for ETL sync
-- Returns revenue aggregated by date, market, and lesson_type
-- Only fetches records since last sync date

SELECT 
    DATE(a.start) AS lesson_date,
    COALESCE(SUM(
        CASE
            WHEN s.dft_charge_type = 'hourly' THEN ar.charge_rate * a.units
            WHEN s.dft_charge_type = 'one-off' THEN ar.charge_rate
            WHEN s.dft_charge_type = 'one-off-split' THEN ar.charge_rate
            WHEN s.dft_charge_type = 'hourly-split' THEN ar.charge_rate * a.units
            ELSE ar.charge_rate * a.units
        END
    ), 0) AS revenue,
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
JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
    AND ar.status <> 'missed'
JOIN services s ON a.service_id = s.service_id
WHERE a.status IN ('complete', 'cancelled-chargeable')
    AND a.is_deleted IS NOT TRUE
    AND DATE(a.start) >= $1  -- last_sync_date parameter
    AND DATE(a.start) < CURRENT_DATE
GROUP BY DATE(a.start), s.labels
ORDER BY lesson_date;

