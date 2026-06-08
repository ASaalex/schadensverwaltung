-- =============================================================================
--  Ampel-Feinschliff + schärfere Track-Erkennung
--   - Status 'none' für Klassen ohne Kontrollpflicht (Intervall = 0)
--   - rot   = überfällig oder fällig in <= 10 Tagen
--   - gelb  = fällig in 11..30 Tagen
--   - grün  = fällig in > 30 Tagen
--   - Track-Erkennung: Puffer 12 m, Mindest-Überdeckung 60 %
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
    WHEN COALESCE(ci.interval_months, 12) = 0 THEN 'none'            -- keine Kontrollpflicht
    WHEN li.last_at IS NULL THEN 'red'                               -- nie begangen
    WHEN li.last_at + make_interval(months => ci.interval_months) <= now() + interval '10 days' THEN 'red'
    WHEN li.last_at + make_interval(months => ci.interval_months) <= now() + interval '30 days' THEN 'yellow'
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

-- Track-Erkennung schärfer: engerer Puffer + höhere Mindest-Überdeckung
CREATE OR REPLACE FUNCTION mark_track_inspected(
  track jsonb,
  buffer_m double precision DEFAULT 12,
  min_coverage double precision DEFAULT 0.6
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  trk geometry := ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(track::text), 4326), 3857);
  buf geometry := ST_Buffer(trk, buffer_m);
  cid uuid := current_user_company_id();
  uid uuid := auth.uid();
  cnt int := 0;
  r   record;
  seg geometry;
  cov double precision;
BEGIN
  FOR r IN
    SELECT id, geom FROM road_segments
    WHERE company_id = cid AND geom IS NOT NULL
      AND ST_Intersects(ST_Transform(geom, 3857), buf)
  LOOP
    seg := ST_Transform(r.geom, 3857);
    cov := ST_Length(ST_Intersection(seg, buf)) / NULLIF(ST_Length(seg), 0);
    IF cov >= min_coverage THEN
      INSERT INTO segment_inspections (company_id, segment_id, inspected_by, coverage_pct)
        VALUES (cid, r.id, uid, round(cov::numeric, 3));
      cnt := cnt + 1;
    END IF;
  END LOOP;
  RETURN cnt;
END;
$$;
