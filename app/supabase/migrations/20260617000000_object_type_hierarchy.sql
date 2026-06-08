-- =============================================================================
--  Objekttypen hierarchisch (wie Schadenskatalog) + Merkmale je Typ
-- =============================================================================

ALTER TABLE network_object_types
  ADD COLUMN IF NOT EXISTS parent_id       uuid REFERENCES network_object_types(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS property_schema jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS sort_order      int   NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS network_object_types_parent_idx ON network_object_types(parent_id);
