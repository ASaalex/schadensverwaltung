-- =============================================================================
--  Druckvorlagen + Kundeneigene Felder
-- =============================================================================

-- Druckkonfiguration pro Firma (ein Datensatz je Firma)
CREATE TABLE print_config (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  config      jsonb       NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE print_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "print_config_read"  ON print_config FOR SELECT USING (company_id = current_user_company_id());
CREATE POLICY "print_config_write" ON print_config FOR ALL   USING (company_id = current_user_company_id() AND current_user_role() = 'admin');

-- Kundeneigene Felder (Auftrag oder Schaden)
CREATE TABLE custom_fields (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid    NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type  text    NOT NULL CHECK (entity_type IN ('order', 'damage')),
  field_name   text    NOT NULL,   -- maschinenlesbar, z. B. "vergabenummer"
  field_label  text    NOT NULL,   -- Anzeigename, z. B. "Vergabe-Nr."
  field_type   text    NOT NULL CHECK (field_type IN ('text','number','date','select','boolean')),
  field_options jsonb,              -- ["Opt1","Opt2"] für select
  required     boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, entity_type, field_name)
);

CREATE INDEX custom_fields_company_idx ON custom_fields(company_id, entity_type, sort_order);

ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_fields_read"  ON custom_fields FOR SELECT USING (company_id = current_user_company_id());
CREATE POLICY "custom_fields_write" ON custom_fields FOR ALL   USING (company_id = current_user_company_id() AND current_user_role() = 'admin');

-- Werte der Zusatzfelder in Aufträgen
ALTER TABLE orders ADD COLUMN IF NOT EXISTS custom_values jsonb NOT NULL DEFAULT '{}';
