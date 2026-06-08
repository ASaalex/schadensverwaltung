-- =============================================================================
--  Fälligkeits-Ampel tagesgenau (statt monatsweise)
--    rot   = überfällig ODER fällig in <= 30 Tagen (oder nie begangen)
--    gelb  = fällig in 31..60 Tagen
--    grün  = fällig in > 60 Tagen (oder Intervall = 0 → keine Kontrolle)
--  Zusätzlich days_until_due (negativ = überfällig).
-- =============================================================================

CREATE OR REPLACE VIEW segment_inspection_status
WITH (security_invoker = on) AS
SELECT
  s.id,
  s.company_id,
  s.strassen_klasse_asb,
  li.last_at,
  COALESCE(ci.interval_months, 12) AS interval_months,
  CASE WHEN COALESCE(ci.interval_months, 12) = 0 OR li.last_at IS NULL THEN NULL
       ELSE li.last_at + make_interval(months => ci.interval_months)
  END AS due_at,
  CASE
    WHEN COALESCE(ci.interval_months, 12) = 0 THEN 'green'           -- keine Kontrolle
    WHEN li.last_at IS NULL THEN 'red'                               -- nie begangen
    WHEN li.last_at + make_interval(months => ci.interval_months) <= now() + interval '30 days' THEN 'red'
    WHEN li.last_at + make_interval(months => ci.interval_months) <= now() + interval '60 days' THEN 'yellow'
    ELSE 'green'
  END AS status,
  CASE
    WHEN COALESCE(ci.interval_months, 12) = 0 OR li.last_at IS NULL THEN NULL
    ELSE floor(EXTRACT(EPOCH FROM (
      (li.last_at + make_interval(months => ci.interval_months)) - now()
    )) / 86400)::int
  END AS days_until_due
FROM road_segments s
LEFT JOIN LATERAL (
  SELECT max(inspected_at) AS last_at FROM segment_inspections i WHERE i.segment_id = s.id
) li ON true
LEFT JOIN road_class_intervals ci ON ci.company_id = s.company_id AND ci.road_class = s.strassen_klasse_asb;
