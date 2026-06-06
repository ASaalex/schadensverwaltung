-- =============================================================================
--  RLS-Fix: Feldmitarbeiter & Disponenten dürfen Netz-Objekte anlegen
--  (vorher nur Admins → Vor-Ort-Erfassung war blockiert)
--  Außerdem WITH CHECK ergänzt (INSERT braucht WITH CHECK, nicht nur USING)
-- =============================================================================

-- ── network_objects ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "no_write" ON network_objects;

-- Lesen: ganze Firma (bleibt)
-- Schreiben: alle eingeloggten Nutzer der Firma (Erfasser legen vor Ort an)
CREATE POLICY "no_insert" ON network_objects
  FOR INSERT
  WITH CHECK (company_id = current_user_company_id());

CREATE POLICY "no_update" ON network_objects
  FOR UPDATE
  USING (company_id = current_user_company_id())
  WITH CHECK (company_id = current_user_company_id());

-- Löschen weiterhin nur Admin (Schutz vor versehentlichem Verlust)
CREATE POLICY "no_delete" ON network_objects
  FOR DELETE
  USING (company_id = current_user_company_id() AND current_user_role() = 'admin');

-- ── network_object_types ─────────────────────────────────────────────────────
-- Typen-Definition bleibt Admin-only, aber WITH CHECK korrekt ergänzen
DROP POLICY IF EXISTS "not_write" ON network_object_types;

CREATE POLICY "not_write" ON network_object_types
  FOR ALL
  USING (company_id = current_user_company_id() AND current_user_role() = 'admin')
  WITH CHECK (company_id = current_user_company_id() AND current_user_role() = 'admin');
