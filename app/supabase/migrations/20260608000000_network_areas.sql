-- Netz-Flächen (Spielplätze, Parks, Parkplätze, Verkehrsflächen …)
CREATE TABLE network_areas (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text         NOT NULL,
  area_type   text         NOT NULL DEFAULT 'sonstige'
    CHECK (area_type IN ('park','spielplatz','parkplatz','verkehrsflaeche','gruenflaeche','platz','sonstige')),
  geometry    jsonb        NOT NULL,  -- GeoJSON Polygon
  gueltig_von date         NOT NULL DEFAULT CURRENT_DATE,
  gueltig_bis date,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX network_areas_company_idx ON network_areas(company_id);

ALTER TABLE network_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "network_areas_read"  ON network_areas FOR SELECT USING (company_id = current_user_company_id());
CREATE POLICY "network_areas_write" ON network_areas FOR ALL   USING (company_id = current_user_company_id() AND current_user_role() = 'admin');

CREATE TRIGGER network_areas_updated_at
  BEFORE UPDATE ON network_areas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
