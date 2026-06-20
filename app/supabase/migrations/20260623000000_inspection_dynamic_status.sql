-- =============================================================================
--  Dynamische Fälligkeits-Ampel (relativ zum Kontrollintervall) +
--  Live-Markierung während des Kontrollgangs (50 % Überdeckung, Dedup)
--
--  Bisher: feste Schwellen (rot <=10 Tage, gelb <=30 Tage) — bei kurzen
--  Intervallen (z. B. 14 Tage) unsinnig, weil fast dauerhaft rot.
--  Jetzt:  Schwellen als Anteil des Intervalls
--            rot   = überfällig / nie begangen / Restzeit <= 10 % des Intervalls
--            gelb  = Restzeit <= 25 % des Intervalls
--            grün  = sonst
--          (mind. 1 Tag rot, damit auch sehr kurze Intervalle eine rote Phase haben)
-- =============================================================================

DROP VIEW IF EXISTS segment_inspection_status;
CREATE VIEW segment_inspection_status
WITH (security_invoker = on) AS
SELECT
  s.id,
  s.company_id,
  s.strassen_klasse_asb,
  c.last_at,
  c.interval_days,
  CASE WHEN c.interval_days = 0 OR c.last_at IS NULL THEN NULL
       ELSE c.last_at + make_interval(days => c.interval_days)
  END AS due_at,
  CASE
    WHEN c.interval_days = 0   THEN 'none'   -- keine Kontrollpflicht
    WHEN c.last_at IS NULL     THEN 'red'    -- nie begangen
    WHEN c.dd <= GREATEST(1, ceil(c.interval_days * 0.10)) THEN 'red'
    WHEN c.dd <= GREATEST(2, ceil(c.interval_days * 0.25)) THEN 'yellow'
    ELSE 'green'
  END AS status,
  CASE WHEN c.interval_days = 0 OR c.last_at IS NULL THEN NULL ELSE c.dd END AS days_until_due
FROM road_segments s
LEFT JOIN LATERAL (
  SELECT
    li.last_at,
    COALESCE(ci.interval_days, ci.interval_months * 30, 365) AS interval_days,
    floor(EXTRACT(EPOCH FROM (
      (li.last_at + make_interval(days => COALESCE(ci.interval_days, ci.interval_months * 30, 365))) - now()
    )) / 86400)::int AS dd
  FROM (SELECT max(inspected_at) AS last_at FROM segment_inspections i WHERE i.segment_id = s.id) li
  LEFT JOIN road_class_intervals ci ON ci.company_id = s.company_id AND ci.road_class = s.strassen_klasse_asb
) c ON true;

-- -----------------------------------------------------------------------------
-- Track-Erkennung: Mindest-Überdeckung 50 % (statt 60 %) + Dedup-Fenster, damit
-- ein Abschnitt während eines laufenden Kontrollgangs nur einmal markiert wird
-- (Live-Aufruf während des Gangs darf wiederholt erfolgen, ohne Duplikate).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS mark_track_inspected(jsonb, double precision, double precision);
DROP FUNCTION IF EXISTS mark_track_inspected(jsonb);

CREATE OR REPLACE FUNCTION mark_track_inspected(
  track jsonb,
  buffer_m double precision DEFAULT 12,
  min_coverage double precision DEFAULT 0.5,
  dedup_minutes int DEFAULT 0
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
      -- Dedup: innerhalb des Fensters bereits markierte Abschnitte überspringen
      IF dedup_minutes > 0 AND EXISTS (
        SELECT 1 FROM segment_inspections x
        WHERE x.segment_id = r.id
          AND x.inspected_at > now() - make_interval(mins => dedup_minutes)
      ) THEN
        CONTINUE;
      END IF;
      INSERT INTO segment_inspections (company_id, segment_id, inspected_by, coverage_pct)
        VALUES (cid, r.id, uid, round(cov::numeric, 3));
      cnt := cnt + 1;
    END IF;
  END LOOP;
  RETURN cnt;
END;
$$;
