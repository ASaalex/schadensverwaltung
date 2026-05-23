-- =============================================================================
--  Fix: companies-RLS so anpassen, dass
--   1) Admin neue Firmen anlegen kann (INSERT + RETURNING braucht SELECT-Recht
--      auf der neuen Zeile — die hat aber andere id als current_user_company_id).
--   2) Frontend-Dropdowns ALLE Firmen sehen (für Auftragsbildung, Nutzer-Anlage).
--   3) Schreibrechte weiterhin auf admin-Rolle beschränkt bleiben.
--
--  Hintergrund:
--    Die alte Policy companies_select_own filterte mit
--    `id = current_user_company_id()` und blockierte damit RETURNING beim
--    INSERT von Fremd-Firmen. Außerdem zeigte sie dem Admin im Firmen-Picker
--    nur die eigene Org statt aller Firmen.
--
--  Für Single-Tenant ist es sauber, dass jeder authentifizierte Nutzer der
--  Organisation alle Firmen-Stammdaten lesen darf (auch externe).
--  Bei späterem Multi-Tenant-Schalter braucht es zusätzlich ein owner_company_id
--  in companies — dann wird die Policy entsprechend verschärft.
-- =============================================================================

-- 1) Alte Policies entfernen
drop policy if exists companies_select_own on public.companies;
drop policy if exists companies_admin_write on public.companies;

-- 2) Lesen: jeder eingeloggte Nutzer sieht alle Firmen
drop policy if exists companies_select_auth on public.companies;
create policy companies_select_auth on public.companies for select
  using (auth.uid() is not null);

-- 3) Anlegen: nur Admin
drop policy if exists companies_admin_insert on public.companies;
create policy companies_admin_insert on public.companies for insert
  with check (public.current_user_role() = 'admin');

-- 4) Aktualisieren: nur Admin
drop policy if exists companies_admin_update on public.companies;
create policy companies_admin_update on public.companies for update
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- 5) Löschen: nur Admin (in der Praxis deaktivieren statt löschen)
drop policy if exists companies_admin_delete on public.companies;
create policy companies_admin_delete on public.companies for delete
  using (public.current_user_role() = 'admin');
