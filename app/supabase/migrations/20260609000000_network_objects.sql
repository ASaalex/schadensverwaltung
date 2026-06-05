-- =============================================================================
--  Netz-Objekte (Laternen, Leitplanken, Erdwälle, …)
-- =============================================================================

-- Objekttypen (Firma definiert welche Typen sie hat)
CREATE TABLE network_object_types (
  id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid  NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         text  NOT NULL,
  geometry_type text NOT NULL CHECK (geometry_type IN ('point','line','polygon')),
  color        text  NOT NULL DEFAULT '#6366f1',
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE network_object_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "not_read"   ON network_object_types FOR SELECT USING (company_id = current_user_company_id());
CREATE POLICY "not_write"  ON network_object_types FOR ALL   USING (company_id = current_user_company_id() AND current_user_role() = 'admin');

-- Konkrete Objekte (je Objekttyp)
CREATE TABLE network_objects (
  id             uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid  NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  object_type_id uuid  NOT NULL REFERENCES network_object_types(id) ON DELETE CASCADE,
  name           text,                      -- z. B. "Laterne 42"
  identifier     text,                      -- interne Nummer/ID
  geometry       jsonb NOT NULL,            -- GeoJSON Point / LineString / Polygon
  attributes     jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX network_objects_company_idx ON network_objects(company_id);
CREATE INDEX network_objects_type_idx    ON network_objects(object_type_id);

ALTER TABLE network_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no_read"    ON network_objects FOR SELECT USING (company_id = current_user_company_id());
CREATE POLICY "no_write"   ON network_objects FOR ALL   USING (company_id = current_user_company_id() AND current_user_role() = 'admin');

CREATE TRIGGER network_objects_updated_at
  BEFORE UPDATE ON network_objects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Kategorie → Objekttypen (welche Objekte passen zu diesem Schadenstyp?)
ALTER TABLE damage_categories
  ADD COLUMN IF NOT EXISTS object_type_ids jsonb NOT NULL DEFAULT '[]';

-- Schaden → Objekt
ALTER TABLE damages
  ADD COLUMN IF NOT EXISTS network_object_id uuid REFERENCES network_objects(id) ON DELETE SET NULL;

CREATE INDEX damages_object_idx ON damages(network_object_id);
