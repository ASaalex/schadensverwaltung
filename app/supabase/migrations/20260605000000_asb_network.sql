-- =============================================================================
--  ASB-Erweiterung: Straßennetz + Netz-Referenzierung der Schäden
--  Anweisung zur Straßeninformationsbank (ASB)
-- =============================================================================

-- ── road_segments: ASB-Felder ergänzen ────────────────────────────────────────

-- Alte road_class-CHECK-Constraint entfernen (wird durch asb_klasse ersetzt)
ALTER TABLE road_segments
  DROP CONSTRAINT IF EXISTS road_segments_road_class_check;

-- ASB-konforme Straßenklasse
ALTER TABLE road_segments
  ADD COLUMN IF NOT EXISTS strassen_klasse_asb text
    CHECK (strassen_klasse_asb IN ('A','B','L','K','St','Gem','GV','P','Rad','sonst')),
  ADD COLUMN IF NOT EXISTS strassen_nummer   text,          -- z. B. "B 4", "L 1036", "K 12"
  ADD COLUMN IF NOT EXISTS abschnitts_nummer text,          -- Abschnittsbezeichnung
  ADD COLUMN IF NOT EXISTS ast_nummer        text DEFAULT '0', -- 0 = Hauptabschnitt
  ADD COLUMN IF NOT EXISTS von_station       numeric DEFAULT 0, -- Start-Stationierung in m
  ADD COLUMN IF NOT EXISTS bis_station       numeric;        -- End-Station (auto = von_station + length_m)

-- Bestehende road_class-Werte auf ASB mappen (best-effort)
UPDATE road_segments SET strassen_klasse_asb = CASE road_class
  WHEN 'hauptstrasse'   THEN 'K'
  WHEN 'nebenstrasse'   THEN 'Gem'
  WHEN 'wirtschaftsweg' THEN 'P'
  WHEN 'radweg'         THEN 'Rad'
  WHEN 'fussweg'        THEN 'sonst'
  ELSE 'sonst'
END
WHERE strassen_klasse_asb IS NULL AND road_class IS NOT NULL;

-- bis_station automatisch befüllen wo noch leer
UPDATE road_segments
  SET bis_station = von_station + COALESCE(length_m, 0)
WHERE bis_station IS NULL;

-- ── damages: Netz-Referenz-Spalten ────────────────────────────────────────────

ALTER TABLE damages
  ADD COLUMN IF NOT EXISTS netz_segment_id   uuid REFERENCES road_segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS netz_station_m    numeric,    -- Absolute Stationierung ab von_station
  ADD COLUMN IF NOT EXISTS netz_offset_m     numeric,    -- Offset ab Segment-Anfang
  ADD COLUMN IF NOT EXISTS netz_abstand_m    numeric,    -- Lotrechter Abstand zur Bestandsachse
  ADD COLUMN IF NOT EXISTS netz_referenz     text;       -- Menschenlesbar: "K 12 · Abschn. 10 · Stat. 1+234 m"

CREATE INDEX IF NOT EXISTS damages_netz_segment_idx ON damages(netz_segment_id);
