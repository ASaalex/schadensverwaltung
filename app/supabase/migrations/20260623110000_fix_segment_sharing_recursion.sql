-- =============================================================================
--  Fix: "infinite recursion detected in policy for relation road_segments"
--
--  Ursache: road_segments_read fragt road_segment_shares ab, dessen Policy
--  wiederum road_segments abfragt → gegenseitige RLS-Auswertung = Rekursion.
--
--  Lösung: die jeweils andere Tabelle über SECURITY-DEFINER-Funktionen prüfen
--  (umgehen RLS → keine erneute Policy-Auswertung, keine Rekursion).
-- =============================================================================

-- Ist der Abschnitt für die aktuelle Firma freigegeben? (ohne RLS auf shares)
CREATE OR REPLACE FUNCTION public.segment_is_shared_to_current(seg_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM road_segment_shares sh
    WHERE sh.segment_id = seg_id
      AND sh.company_id = public.current_user_company_id()
  );
$$;

-- Eigentümer-Firma eines Abschnitts (ohne RLS auf road_segments)
CREATE OR REPLACE FUNCTION public.segment_owner_company(seg_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT company_id FROM road_segments WHERE id = seg_id;
$$;

-- road_segments: eigene + freigegebene Abschnitte (ohne Unterabfrage auf shares)
DROP POLICY IF EXISTS "road_segments_read" ON road_segments;
CREATE POLICY "road_segments_read" ON road_segments FOR SELECT USING (
  company_id = public.current_user_company_id()
  OR public.segment_is_shared_to_current(id)
);

-- road_segment_shares: Lesen für Eigentümer ODER freigegebene Firma
DROP POLICY IF EXISTS rss_read ON road_segment_shares;
CREATE POLICY rss_read ON road_segment_shares FOR SELECT USING (
  company_id = public.current_user_company_id()
  OR public.segment_owner_company(segment_id) = public.current_user_company_id()
);

-- road_segment_shares: Schreiben nur durch Admin der Eigentümer-Firma
DROP POLICY IF EXISTS rss_write ON road_segment_shares;
CREATE POLICY rss_write ON road_segment_shares FOR ALL USING (
  public.current_user_role() = 'admin'
  AND public.segment_owner_company(segment_id) = public.current_user_company_id()
) WITH CHECK (
  public.current_user_role() = 'admin'
  AND public.segment_owner_company(segment_id) = public.current_user_company_id()
);
