-- Straßennetz-Segmente
CREATE TABLE road_segments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_node   text        NOT NULL,
  to_node     text        NOT NULL,
  name        text,
  length_m    numeric,
  road_class  text        CHECK (road_class IN ('hauptstrasse','nebenstrasse','wirtschaftsweg','radweg','fussweg','sonstige')),
  geometry    jsonb,      -- GeoJSON LineString { type: "LineString", coordinates: [[lng,lat], ...] }
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX road_segments_company_idx ON road_segments(company_id);

ALTER TABLE road_segments ENABLE ROW LEVEL SECURITY;

-- Interne Rollen sehen alle Segmente der eigenen Firma
CREATE POLICY "road_segments_read" ON road_segments
  FOR SELECT USING (company_id = current_user_company_id());

-- Nur Admins dürfen schreiben
CREATE POLICY "road_segments_write" ON road_segments
  FOR ALL USING (
    company_id = current_user_company_id()
    AND current_user_role() = 'admin'
  );

-- updated_at-Hilfsfunktion (falls noch nicht vorhanden)
CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- updated_at-Trigger
CREATE TRIGGER road_segments_updated_at
  BEFORE UPDATE ON road_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
