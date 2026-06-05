-- =============================================================================
--  Netzknoten als eigene Objekte mit fester Kartenposition
-- =============================================================================

CREATE TABLE network_nodes (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text         NOT NULL,            -- Knotenbezeichnung, z. B. "NK-101"
  lng         numeric(12,8) NOT NULL,
  lat         numeric(12,8) NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

CREATE INDEX network_nodes_company_idx ON network_nodes(company_id);

ALTER TABLE network_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "network_nodes_read"  ON network_nodes FOR SELECT USING (company_id = current_user_company_id());
CREATE POLICY "network_nodes_write" ON network_nodes FOR ALL   USING (company_id = current_user_company_id() AND current_user_role() = 'admin');

CREATE TRIGGER network_nodes_updated_at
  BEFORE UPDATE ON network_nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Segmente können optional auf Knoten per ID referenzieren
ALTER TABLE road_segments
  ADD COLUMN IF NOT EXISTS from_node_id uuid REFERENCES network_nodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_node_id   uuid REFERENCES network_nodes(id) ON DELETE SET NULL;

CREATE INDEX road_segments_from_node_idx ON road_segments(from_node_id);
CREATE INDEX road_segments_to_node_idx   ON road_segments(to_node_id);
