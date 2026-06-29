-- =============================================================================
-- GEBÜNDELTE OFFENE MIGRATIONEN (in dieser Reihenfolge im SQL-Editor ausführen)
--  1) 20260623000000_inspection_dynamic_status
--  2) 20260623100000_segment_sharing
--  3) 20260623110000_fix_segment_sharing_recursion
--  4) 20260623200000_object_inspections
-- Idempotent (DROP/CREATE OR REPLACE) – mehrfaches Ausführen ist unkritisch.
-- =============================================================================


-- ########## 20260623000000_inspection_dynamic_status.sql ##########

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

-- ########## 20260623100000_segment_sharing.sql ##########

-- =============================================================================
--  Straßenabschnitte für weitere Firmen sichtbar machen (read-only)
--
--  road_segments gehören weiterhin EINER Eigentümer-Firma (company_id) – die
--  Pflege, Kontrolle und Fälligkeit bleibt dort. Über road_segment_shares kann
--  ein Abschnitt zusätzlich für andere Firmen SICHTBAR gemacht werden
--  (nur Anzeige auf der Karte / im Netz, kein Schreibrecht).
-- =============================================================================

CREATE TABLE IF NOT EXISTS road_segment_shares (
  segment_id uuid NOT NULL REFERENCES road_segments(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id)     ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (segment_id, company_id)
);
CREATE INDEX IF NOT EXISTS road_segment_shares_company_idx ON road_segment_shares(company_id);

ALTER TABLE road_segment_shares ENABLE ROW LEVEL SECURITY;

-- Lesen: Eigentümer des Abschnitts ODER die Firma, für die freigegeben wurde
DROP POLICY IF EXISTS rss_read ON road_segment_shares;
CREATE POLICY rss_read ON road_segment_shares FOR SELECT USING (
  company_id = current_user_company_id()
  OR EXISTS (
    SELECT 1 FROM road_segments s
    WHERE s.id = road_segment_shares.segment_id
      AND s.company_id = current_user_company_id()
  )
);

-- Schreiben (freigeben/entziehen): nur Admin der Eigentümer-Firma
DROP POLICY IF EXISTS rss_write ON road_segment_shares;
CREATE POLICY rss_write ON road_segment_shares FOR ALL USING (
  current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1 FROM road_segments s
    WHERE s.id = road_segment_shares.segment_id
      AND s.company_id = current_user_company_id()
  )
) WITH CHECK (
  current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1 FROM road_segments s
    WHERE s.id = road_segment_shares.segment_id
      AND s.company_id = current_user_company_id()
  )
);

-- road_segments-Lesepolicy erweitern: eigene + freigegebene Abschnitte
DROP POLICY IF EXISTS "road_segments_read" ON road_segments;
CREATE POLICY "road_segments_read" ON road_segments FOR SELECT USING (
  company_id = current_user_company_id()
  OR EXISTS (
    SELECT 1 FROM road_segment_shares sh
    WHERE sh.segment_id = road_segments.id
      AND sh.company_id = current_user_company_id()
  )
);

-- ########## 20260623110000_fix_segment_sharing_recursion.sql ##########

-- =============================================================================
--  Fix: "infinite recursion detected in policy for relation road_segments"
--
--  Ursache: road_segments_read fragt road_segment_shares ab, dessen Policy
--  wiederum road_segments abfragt → gegenseitige RLS-Auswertung = Rekursion.
--
--  Lösung: die jeweils andere Tabelle über SECURITY-DEFINER-Funktionen prüfen
--  (umgehen RLS → keine erneute Policy-Auswertung, keine Rekursion).
-- =============================================================================

-- Ist der Abschnitt für die aktuelle Firma freigegeben? (ohne RLS auf shares)
CREATE OR REPLACE FUNCTION public.segment_is_shared_to_current(seg_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM road_segment_shares sh
    WHERE sh.segment_id = seg_id
      AND sh.company_id = public.current_user_company_id()
  );
$$;

-- Eigentümer-Firma eines Abschnitts (ohne RLS auf road_segments)
CREATE OR REPLACE FUNCTION public.segment_owner_company(seg_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT company_id FROM road_segments WHERE id = seg_id;
$$;

-- road_segments: eigene + freigegebene Abschnitte (ohne Unterabfrage auf shares)
DROP POLICY IF EXISTS "road_segments_read" ON road_segments;
CREATE POLICY "road_segments_read" ON road_segments FOR SELECT USING (
  company_id = public.current_user_company_id()
  OR public.segment_is_shared_to_current(id)
);

-- road_segment_shares: Lesen für Eigentümer ODER freigegebene Firma
DROP POLICY IF EXISTS rss_read ON road_segment_shares;
CREATE POLICY rss_read ON road_segment_shares FOR SELECT USING (
  company_id = public.current_user_company_id()
  OR public.segment_owner_company(segment_id) = public.current_user_company_id()
);

-- road_segment_shares: Schreiben nur durch Admin der Eigentümer-Firma
DROP POLICY IF EXISTS rss_write ON road_segment_shares;
CREATE POLICY rss_write ON road_segment_shares FOR ALL USING (
  public.current_user_role() = 'admin'
  AND public.segment_owner_company(segment_id) = public.current_user_company_id()
) WITH CHECK (
  public.current_user_role() = 'admin'
  AND public.segment_owner_company(segment_id) = public.current_user_company_id()
);

-- ########## 20260623200000_object_inspections.sql ##########

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

-- ########## 20260623210000_object_interval_inherit.sql ##########

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
