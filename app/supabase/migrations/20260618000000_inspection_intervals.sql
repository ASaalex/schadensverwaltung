-- =============================================================================
--  Kontrollintervalle je Straßenklasse + Begehungs-Tracking
-- =============================================================================

-- 1) Intervall je Straßenklasse (Monate)
CREATE TABLE IF NOT EXISTS road_class_intervals (
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  road_class      text NOT NULL,            -- ASB-Klasse: A/B/L/K/St/Gem/GV/P/Rad/sonst
  interval_months int  NOT NULL DEFAULT 12,
  PRIMARY KEY (company_id, road_class)
);
ALTER TABLE road_class_intervals ENABLE ROW LEVEL SECURITY;
CREATE POLICY rci_read  ON road_class_intervals FOR SELECT USING (company_id = current_user_company_id());
CREATE POLICY rci_write ON road_class_intervals FOR ALL
  USING (company_id = current_user_company_id() AND current_user_role() = 'admin')
  WITH CHECK (company_id = current_user_company_id() AND current_user_role() = 'admin');

-- 2) Begehungen je Abschnitt
CREATE TABLE IF NOT EXISTS segment_inspections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  segment_id   uuid NOT NULL REFERENCES road_segments(id) ON DELETE CASCADE,
  inspected_at timestamptz NOT NULL DEFAULT now(),
  inspected_by uuid REFERENCES users(id),
  coverage_pct numeric
);
CREATE INDEX IF NOT EXISTS segment_inspections_seg_idx ON segment_inspections(segment_id);
CREATE INDEX IF NOT EXISTS segment_inspections_company_idx ON segment_inspections(company_id);
ALTER TABLE segment_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY si_read   ON segment_inspections FOR SELECT USING (company_id = current_user_company_id());
CREATE POLICY si_insert ON segment_inspections FOR INSERT WITH CHECK (company_id = current_user_company_id());

-- 3) PostGIS-Geometrie für Abschnitte (aus GeoJSON synchron)
CREATE EXTENSION IF NOT EXISTS postgis;
ALTER TABLE road_segments ADD COLUMN IF NOT EXISTS geom geometry(LineString, 4326);

CREATE OR REPLACE FUNCTION road_segments_sync_geom()
RETURNS trigger AS $$
BEGIN
  BEGIN
    NEW.geom := ST_SetSRID(ST_GeomFromGeoJSON(NEW.geometry::text), 4326);
  EXCEPTION WHEN others THEN
    NEW.geom := NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS road_segments_geom ON road_segments;
CREATE TRIGGER road_segments_geom
  BEFORE INSERT OR UPDATE OF geometry ON road_segments
  FOR EACH ROW EXECUTE FUNCTION road_segments_sync_geom();

UPDATE road_segments SET geometry = geometry;  -- Backfill
CREATE INDEX IF NOT EXISTS road_segments_geom_gix ON road_segments USING gist (geom);

-- 4) Status-View: roter/gelber/grüner Abschnitt je nach Fälligkeit
CREATE OR REPLACE VIEW segment_inspection_status
WITH (security_invoker = on) AS
SELECT
  s.id,
  s.company_id,
  s.strassen_klasse_asb,
  li.last_at,
  COALESCE(ci.interval_months, 12) AS interval_months,
  (li.last_at + make_interval(months => COALESCE(ci.interval_months, 12))) AS due_at,
  CASE
    WHEN li.last_at IS NULL THEN 'red'
    WHEN date_trunc('month', li.last_at + make_interval(months => COALESCE(ci.interval_months, 12)))
         <= date_trunc('month', now()) THEN 'red'
    WHEN date_trunc('month', li.last_at + make_interval(months => COALESCE(ci.interval_months, 12)))
         = date_trunc('month', now()) + interval '1 month' THEN 'yellow'
    ELSE 'green'
  END AS status
FROM road_segments s
LEFT JOIN LATERAL (
  SELECT max(inspected_at) AS last_at FROM segment_inspections i WHERE i.segment_id = s.id
) li ON true
LEFT JOIN road_class_intervals ci ON ci.company_id = s.company_id AND ci.road_class = s.strassen_klasse_asb;

-- 5) RPC: aus einem GPS-Track die ausreichend begangenen Abschnitte als
--    kontrolliert markieren (>= min_coverage des Abschnitts im Track-Puffer)
CREATE OR REPLACE FUNCTION mark_track_inspected(
  track jsonb,
  buffer_m double precision DEFAULT 20,
  min_coverage double precision DEFAULT 0.5
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

GRANT EXECUTE ON FUNCTION mark_track_inspected(jsonb, double precision, double precision) TO authenticated;
