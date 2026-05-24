-- =============================================================================
--  Fix: Admin darf Nutzer für JEDE Firma anlegen
--
--  Vorher: users_admin_write hatte `company_id = current_user_company_id()`
--  → Admin konnte nur User für die EIGENE Firma anlegen.
--  → Beim Anlegen eines Firmen-Nutzers für eine externe Firma scheiterte das
--    INSERT mit "new row violates row-level security policy for table users".
--
--  Jetzt: Admin sieht ALLE User aller Firmen und kann für jede Firma anlegen.
--  Konsistent mit Single-Tenant-Setup, wo der Bauhof-Admin auch die
--  Firmen-Nutzer der externen Dienstleister einrichtet.
-- =============================================================================

-- 1) Alte FOR ALL-Policy entfernen
drop policy if exists users_admin_write on public.users;

-- 2) Admin: SELECT auf ALLE User
drop policy if exists users_select_admin on public.users;
create policy users_select_admin on public.users for select
  using (public.current_user_role() = 'admin');

-- 3) Admin: INSERT (mit beliebiger company_id)
drop policy if exists users_admin_insert on public.users;
create policy users_admin_insert on public.users for insert
  with check (public.current_user_role() = 'admin');

-- 4) Admin: UPDATE
drop policy if exists users_admin_update on public.users;
create policy users_admin_update on public.users for update
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- 5) Admin: DELETE
drop policy if exists users_admin_delete on public.users;
create policy users_admin_delete on public.users for delete
  using (public.current_user_role() = 'admin');

-- users_select_own_org und users_select_self bleiben — die geben den
-- normalen Org-Mitgliedern und sich selbst weiterhin Lese-Zugriff.
