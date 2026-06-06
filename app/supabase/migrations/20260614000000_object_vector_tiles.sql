-- =============================================================================
--  Vektor-Tiles (MVT) für Netz-Objekte via PostGIS ST_AsMVT
--  - echte Geometrie-Spalte (geom) synchron aus dem GeoJSON-jsonb
--  - GiST-Index
--  - RPC objects_mvt(z,x,y) liefert Base64-kodiertes MVT, gefiltert nach Firma
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- ── Geometrie-Spalte (4326) ──────────────────────────────────────────────────
ALTER TABLE network_objects ADD COLUMN IF NOT EXISTS geom geometry(Geometry, 4326);

-- Aus dem GeoJSON-jsonb befüllen (robust gegen Parsefehler)
CREATE OR REPLACE FUNCTION network_objects_sync_geom()
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

DROP TRIGGER IF EXISTS network_objects_geom ON network_objects;
CREATE TRIGGER network_objects_geom
  BEFORE INSERT OR UPDATE OF geometry ON network_objects
  FOR EACH ROW EXECUTE FUNCTION network_objects_sync_geom();

-- Backfill bestehender Zeilen
UPDATE network_objects SET geometry = geometry;

CREATE INDEX IF NOT EXISTS network_objects_geom_gix ON network_objects USING gist (geom);

-- ── MVT-RPC ──────────────────────────────────────────────────────────────────
-- security invoker → RLS der Basistabellen greift; zusätzlich Firmen-Filter.
CREATE OR REPLACE FUNCTION objects_mvt(z integer, x integer, y integer)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  env  geometry := ST_TileEnvelope(z, x, y);
  mvt  bytea;
  cid  uuid := current_user_company_id();
BEGIN
  SELECT ST_AsMVT(t, 'objects', 4096, 'geom') INTO mvt
  FROM (
    SELECT
      o.id::text                                   AS id,
      o.object_type_id::text                       AS object_type_id,
      COALESCE(o.name, o.identifier, ot.name)      AS label,
      ot.color                                     AS color,
      ot.geometry_type                             AS gtype,
      ST_AsMVTGeom(ST_Transform(o.geom, 3857), env, 4096, 64, true) AS geom
    FROM network_objects o
    JOIN network_object_types ot ON ot.id = o.object_type_id
    WHERE o.company_id = cid
      AND o.geom IS NOT NULL
      AND ST_Intersects(ST_Transform(o.geom, 3857), env)
  ) t
  WHERE t.geom IS NOT NULL;

  RETURN encode(COALESCE(mvt, ''::bytea), 'base64');
END;
$$;

GRANT EXECUTE ON FUNCTION objects_mvt(integer, integer, integer) TO authenticated;
