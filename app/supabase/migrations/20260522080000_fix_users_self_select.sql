-- =============================================================================
--  Fix: Nutzer muss seinen eigenen Eintrag in public.users IMMER lesen können
--
--  Hintergrund: Die bestehende Policy `users_select_own_org` filtert über
--  `company_id = current_user_company_id()`. Wenn aus irgendeinem Grund der
--  RLS-Read auf das eigene Profil schiefläuft (Henne-Ei mit SECURITY-DEFINER-
--  Funktion), bekommt das Frontend `null` und denkt, es gäbe kein Profil.
--
--  Diese zusätzliche Policy `users_select_self` (RLS-Policies werden für
--  SELECT mit OR verknüpft) garantiert, dass die loadProfile-Abfrage
--  in AuthContext.tsx immer funktioniert.
-- =============================================================================

drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users for select
  using (id = auth.uid());

-- Sanity-Hinweis: Das ist additiv zu users_select_own_org und ändert die
-- Sichtbarkeit anderer User innerhalb der Organisation nicht.
