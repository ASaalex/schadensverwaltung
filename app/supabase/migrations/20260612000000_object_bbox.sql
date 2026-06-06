-- =============================================================================
--  Bounding-Box-Spalten für Netz-Objekte → schnelle Viewport-Abfragen
--  (ohne PostGIS; Trigger berechnet BBox aus der GeoJSON-Geometrie)
-- =============================================================================

ALTER TABLE network_objects
  ADD COLUMN IF NOT EXISTS bbox_min_lng double precision,
  ADD COLUMN IF NOT EXISTS bbox_min_lat double precision,
  ADD COLUMN IF NOT EXISTS bbox_max_lng double precision,
  ADD COLUMN IF NOT EXISTS bbox_max_lat double precision;

-- ── Funktion: BBox aus GeoJSON berechnen ─────────────────────────────────────
CREATE OR REPLACE FUNCTION network_objects_set_bbox()
RETURNS trigger AS $$
DECLARE
  g       jsonb := NEW.geometry;
  t       text  := g->>'type';
  coords  jsonb := g->'coordinates';
  ring    jsonb;
  pt      jsonb;
  mnlng   double precision;
  mnlat   double precision;
  mxlng   double precision;
  mxlat   double precision;
BEGIN
  IF t = 'Point' THEN
    mnlng := (coords->>0)::double precision;
    mnlat := (coords->>1)::double precision;
    mxlng := mnlng;
    mxlat := mnlat;
  ELSIF t = 'LineString' THEN
    FOR pt IN SELECT * FROM jsonb_array_elements(coords) LOOP
      mnlng := least(mnlng, (pt->>0)::double precision);
      mnlat := least(mnlat, (pt->>1)::double precision);
      mxlng := greatest(mxlng, (pt->>0)::double precision);
      mxlat := greatest(mxlat, (pt->>1)::double precision);
    END LOOP;
  ELSIF t = 'Polygon' THEN
    ring := coords->0;
    FOR pt IN SELECT * FROM jsonb_array_elements(ring) LOOP
      mnlng := least(mnlng, (pt->>0)::double precision);
      mnlat := least(mnlat, (pt->>1)::double precision);
      mxlng := greatest(mxlng, (pt->>0)::double precision);
      mxlat := greatest(mxlat, (pt->>1)::double precision);
    END LOOP;
  END IF;

  NEW.bbox_min_lng := mnlng;
  NEW.bbox_min_lat := mnlat;
  NEW.bbox_max_lng := mxlng;
  NEW.bbox_max_lat := mxlat;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Trigger ──────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS network_objects_bbox ON network_objects;
CREATE TRIGGER network_objects_bbox
  BEFORE INSERT OR UPDATE OF geometry ON network_objects
  FOR EACH ROW EXECUTE FUNCTION network_objects_set_bbox();

-- ── Backfill bestehender Zeilen (löst den Trigger aus) ───────────────────────
UPDATE network_objects SET geometry = geometry;

-- ── Indizes für Overlap-Abfragen ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS network_objects_bbox_lat_idx
  ON network_objects (company_id, bbox_min_lat, bbox_max_lat);
CREATE INDEX IF NOT EXISTS network_objects_bbox_lng_idx
  ON network_objects (company_id, bbox_min_lng, bbox_max_lng);
