-- Gültigkeitszeitraum für Netzabschnitte
-- Ermöglicht historische und zukünftige Netzstände

ALTER TABLE road_segments
  ADD COLUMN IF NOT EXISTS gueltig_von date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS gueltig_bis date;  -- NULL = unbegrenzt gültig

-- Bestehende Segmente: ab heute gültig, kein Ende
UPDATE road_segments SET gueltig_von = CURRENT_DATE WHERE gueltig_von IS NULL;

CREATE INDEX IF NOT EXISTS road_segments_validity_idx
  ON road_segments(gueltig_von, gueltig_bis);

COMMENT ON COLUMN road_segments.gueltig_von IS 'Abschnitt ist ab diesem Datum im Netz';
COMMENT ON COLUMN road_segments.gueltig_bis IS 'Abschnitt ist bis zu diesem Datum im Netz (NULL = unbegrenzt)';
