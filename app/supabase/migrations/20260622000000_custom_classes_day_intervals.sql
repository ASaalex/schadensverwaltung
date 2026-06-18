-- =============================================================================
--  Eigene Straßenklassen + Kontrollintervalle in TAGEN (ermöglicht 2/8 Wochen)
-- =============================================================================

-- 1) Intervall in Tagen (statt nur Monaten)
ALTER TABLE road_class_intervals ADD COLUMN IF NOT EXISTS interval_days int;
-- Bestehende Monatswerte nach Tagen übernehmen (≈30 Tage/Monat)
UPDATE road_class_intervals
  SET interval_days = COALESCE(interval_days, interval_months * 30)
  WHERE interval_days IS NULL;

-- 2) Eigene Straßenklassen je Firma
CREATE TABLE IF NOT EXISTS road_classes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key        text NOT NULL,    -- wird in road_segments.strassen_klasse_asb gespeichert
  label      text NOT NULL,
  sort_order int  NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, key)
);
ALTER TABLE road_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY rc_read  ON road_classes FOR SELECT USING (company_id = current_user_company_id());
CREATE POLICY rc_write ON road_classes FOR ALL
  USING (company_id = current_user_company_id() AND current_user_role() = 'admin')
  WITH CHECK (company_id = current_user_company_id() AND current_user_role() = 'admin');

-- 3) Status-View auf Tages-Intervall umstellen
CREATE OR REPLACE VIEW segment_inspection_status
WITH (security_invoker = on) AS
SELECT
  s.id,
  s.company_id,
  s.strassen_klasse_asb,
  li.last_at,
  COALESCE(ci.interval_days, ci.interval_months * 30, 365) AS interval_days,
  CASE WHEN COALESCE(ci.interval_days, ci.interval_months * 30, 365) = 0 OR li.last_at IS NULL THEN NULL
       ELSE li.last_at + make_interval(days => COALESCE(ci.interval_days, ci.interval_months * 30, 365))
  END AS due_at,
  CASE
    WHEN COALESCE(ci.interval_days, ci.interval_months * 30, 365) = 0 THEN 'none'
    WHEN li.last_at IS NULL THEN 'red'
    WHEN li.last_at + make_interval(days => COALESCE(ci.interval_days, ci.interval_months * 30, 365)) <= now() + interval '10 days' THEN 'red'
    WHEN li.last_at + make_interval(days => COALESCE(ci.interval_days, ci.interval_months * 30, 365)) <= now() + interval '30 days' THEN 'yellow'
    ELSE 'green'
  END AS status,
  CASE
    WHEN COALESCE(ci.interval_days, ci.interval_months * 30, 365) = 0 OR li.last_at IS NULL THEN NULL
    ELSE floor(EXTRACT(EPOCH FROM (
      (li.last_at + make_interval(days => COALESCE(ci.interval_days, ci.interval_months * 30, 365))) - now()
    )) / 86400)::int
  END AS days_until_due
FROM road_segments s
LEFT JOIN LATERAL (
  SELECT max(inspected_at) AS last_at FROM segment_inspections i WHERE i.segment_id = s.id
) li ON true
LEFT JOIN road_class_intervals ci ON ci.company_id = s.company_id AND ci.road_class = s.strassen_klasse_asb;
