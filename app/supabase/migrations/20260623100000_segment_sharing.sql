-- =============================================================================
--  Straßenabschnitte für weitere Firmen sichtbar machen (read-only)
--
--  road_segments gehören weiterhin EINER Eigentümer-Firma (company_id) – die
--  Pflege, Kontrolle und Fälligkeit bleibt dort. Über road_segment_shares kann
--  ein Abschnitt zusätzlich für andere Firmen SICHTBAR gemacht werden
--  (nur Anzeige auf der Karte / im Netz, kein Schreibrecht).
-- =============================================================================

CREATE TABLE IF NOT EXISTS road_segment_shares (
  segment_id uuid NOT NULL REFERENCES road_segments(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id)     ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (segment_id, company_id)
);
CREATE INDEX IF NOT EXISTS road_segment_shares_company_idx ON road_segment_shares(company_id);

ALTER TABLE road_segment_shares ENABLE ROW LEVEL SECURITY;

-- Lesen: Eigentümer des Abschnitts ODER die Firma, für die freigegeben wurde
DROP POLICY IF EXISTS rss_read ON road_segment_shares;
CREATE POLICY rss_read ON road_segment_shares FOR SELECT USING (
  company_id = current_user_company_id()
  OR EXISTS (
    SELECT 1 FROM road_segments s
    WHERE s.id = road_segment_shares.segment_id
      AND s.company_id = current_user_company_id()
  )
);

-- Schreiben (freigeben/entziehen): nur Admin der Eigentümer-Firma
DROP POLICY IF EXISTS rss_write ON road_segment_shares;
CREATE POLICY rss_write ON road_segment_shares FOR ALL USING (
  current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1 FROM road_segments s
    WHERE s.id = road_segment_shares.segment_id
      AND s.company_id = current_user_company_id()
  )
) WITH CHECK (
  current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1 FROM road_segments s
    WHERE s.id = road_segment_shares.segment_id
      AND s.company_id = current_user_company_id()
  )
);

-- road_segments-Lesepolicy erweitern: eigene + freigegebene Abschnitte
DROP POLICY IF EXISTS "road_segments_read" ON road_segments;
CREATE POLICY "road_segments_read" ON road_segments FOR SELECT USING (
  company_id = current_user_company_id()
  OR EXISTS (
    SELECT 1 FROM road_segment_shares sh
    WHERE sh.segment_id = road_segments.id
      AND sh.company_id = current_user_company_id()
  )
);
