-- =============================================================================
--  Objekt-Kontrollintervall entlang der Typ-Hierarchie vererben
--
--  Bisher nutzte object_inspection_status nur das interval_days des direkten
--  Objekt-Typs. Hat ein Unter-Typ kein eigenes Intervall, soll das Intervall
--  des nächsten Ober-Typs gelten (analog zur Vererbung der Merkmale).
-- =============================================================================

DROP VIEW IF EXISTS object_inspection_status;
CREATE VIEW object_inspection_status
WITH (security_invoker = on) AS
WITH RECURSIVE anc AS (
  -- Start: jeder Typ mit sich selbst
  SELECT t.id AS type_id, t.parent_id, t.interval_days, 0 AS depth
  FROM network_object_types t
  UNION ALL
  -- Nur weiter nach oben laufen, solange noch kein Intervall gefunden wurde
  SELECT a.type_id, p.parent_id, p.interval_days, a.depth + 1
  FROM anc a
  JOIN network_object_types p ON p.id = a.parent_id
  WHERE a.interval_days IS NULL
),
eff AS (
  -- effektives Intervall = erstes (niedrigste Tiefe) nicht-leere Intervall der Kette
  SELECT type_id,
         (array_agg(interval_days ORDER BY depth) FILTER (WHERE interval_days IS NOT NULL))[1] AS interval_days
  FROM anc
  GROUP BY type_id
)
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
    COALESCE(eff.interval_days, 0) AS interval_days,
    floor(EXTRACT(EPOCH FROM (
      (li.last_at + make_interval(days => COALESCE(eff.interval_days, 0))) - now()
    )) / 86400)::int AS dd
  FROM (SELECT max(inspected_at) AS last_at FROM object_inspections i WHERE i.object_id = o.id) li
  LEFT JOIN eff ON eff.type_id = o.object_type_id
) c ON true;

-- Track-Erkennung: ebenfalls vererbtes Intervall berücksichtigen
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
    WITH RECURSIVE anc AS (
      SELECT t.id AS type_id, t.parent_id, t.interval_days, 0 AS depth
      FROM network_object_types t
      UNION ALL
      SELECT a.type_id, p.parent_id, p.interval_days, a.depth + 1
      FROM anc a JOIN network_object_types p ON p.id = a.parent_id
      WHERE a.interval_days IS NULL
    ),
    eff AS (
      SELECT type_id,
             (array_agg(interval_days ORDER BY depth) FILTER (WHERE interval_days IS NOT NULL))[1] AS interval_days
      FROM anc GROUP BY type_id
    )
    SELECT o.id, o.geometry
    FROM network_objects o
    JOIN eff ON eff.type_id = o.object_type_id
    WHERE o.company_id = cid
      AND COALESCE(eff.interval_days, 0) > 0
  LOOP
    BEGIN
      objgeom := ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(r.geometry::text), 4326), 3857);
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
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
