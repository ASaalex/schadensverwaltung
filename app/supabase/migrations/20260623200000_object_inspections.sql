-- =============================================================================
--  Kontrollintervalle für Objekte (pro Objekt-Typ) + Begehungs-Erkennung im
--  Kontrollgang + Fälligkeits-Status (analog zu den Straßenabschnitten)
-- =============================================================================

-- 1) Intervall (in Tagen) je Objekt-Typ. NULL/0 = keine Kontrollpflicht.
ALTER TABLE network_object_types ADD COLUMN IF NOT EXISTS interval_days int;

-- 2) Begehungs-Historie je Objekt
CREATE TABLE IF NOT EXISTS object_inspections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id)        ON DELETE CASCADE,
  object_id    uuid NOT NULL REFERENCES network_objects(id)  ON DELETE CASCADE,
  inspected_at timestamptz NOT NULL DEFAULT now(),
  inspected_by uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS object_inspections_object_idx  ON object_inspections(object_id);
CREATE INDEX IF NOT EXISTS object_inspections_company_idx ON object_inspections(company_id);
ALTER TABLE object_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oi_read   ON object_inspections;
CREATE POLICY oi_read   ON object_inspections FOR SELECT USING (company_id = current_user_company_id());
DROP POLICY IF EXISTS oi_insert ON object_inspections;
CREATE POLICY oi_insert ON object_inspections FOR INSERT WITH CHECK (company_id = current_user_company_id());

-- 3) Fälligkeits-Status je Objekt (gleiche dynamische Schwellen wie Straßen)
DROP VIEW IF EXISTS object_inspection_status;
CREATE VIEW object_inspection_status
WITH (security_invoker = on) AS
SELECT
  o.id,
  o.company_id,
  o.object_type_id,
  c.last_at,
  c.interval_days,
  CASE WHEN c.interval_days = 0 OR c.last_at IS NULL THEN NULL
       ELSE c.last_at + make_interval(days => c.interval_days)
  END AS due_at,
  CASE
    WHEN c.interval_days = 0   THEN 'none'
    WHEN c.last_at IS NULL     THEN 'red'
    WHEN c.dd <= GREATEST(1, ceil(c.interval_days * 0.10)) THEN 'red'
    WHEN c.dd <= GREATEST(2, ceil(c.interval_days * 0.25)) THEN 'yellow'
    ELSE 'green'
  END AS status,
  CASE WHEN c.interval_days = 0 OR c.last_at IS NULL THEN NULL ELSE c.dd END AS days_until_due
FROM network_objects o
LEFT JOIN LATERAL (
  SELECT
    li.last_at,
    COALESCE(ot.interval_days, 0) AS interval_days,
    floor(EXTRACT(EPOCH FROM (
      (li.last_at + make_interval(days => COALESCE(ot.interval_days, 0))) - now()
    )) / 86400)::int AS dd
  FROM (SELECT max(inspected_at) AS last_at FROM object_inspections i WHERE i.object_id = o.id) li
  LEFT JOIN network_object_types ot ON ot.id = o.object_type_id
) c ON true;

-- 4) Track-Erkennung für Objekte: Objekte (mit Kontrollpflicht), deren Geometrie
--    näher als buffer_m am Track liegt, werden als kontrolliert markiert.
--    network_objects.geometry ist GeoJSON (jsonb) → zur Berechnung nach 3857.
CREATE OR REPLACE FUNCTION mark_track_objects_inspected(
  track jsonb,
  buffer_m double precision DEFAULT 20,
  dedup_minutes int DEFAULT 0
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  trk geometry := ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(track::text), 4326), 3857);
  cid uuid := current_user_company_id();
  uid uuid := auth.uid();
  cnt int := 0;
  r   record;
  objgeom geometry;
BEGIN
  FOR r IN
    SELECT o.id, o.geometry
    FROM network_objects o
    JOIN network_object_types ot ON ot.id = o.object_type_id
    WHERE o.company_id = cid
      AND COALESCE(ot.interval_days, 0) > 0
  LOOP
    BEGIN
      objgeom := ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(r.geometry::text), 4326), 3857);
    EXCEPTION WHEN OTHERS THEN
      CONTINUE; -- ungültige Geometrie überspringen
    END;
    IF ST_DWithin(objgeom, trk, buffer_m) THEN
      IF dedup_minutes > 0 AND EXISTS (
        SELECT 1 FROM object_inspections x
        WHERE x.object_id = r.id
          AND x.inspected_at > now() - make_interval(mins => dedup_minutes)
      ) THEN
        CONTINUE;
      END IF;
      INSERT INTO object_inspections (company_id, object_id, inspected_by)
        VALUES (cid, r.id, uid);
      cnt := cnt + 1;
    END IF;
  END LOOP;
  RETURN cnt;
END;
$$;
