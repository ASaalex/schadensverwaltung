-- =============================================================================
--  Fehlende DELETE-Policies für damages, damage_photos, order_items
--
--  Default in PostgreSQL bei aktivem RLS: alles verboten, was nicht
--  explizit erlaubt ist. Ich hatte SELECT/INSERT/UPDATE definiert, aber
--  DELETE vergessen → "Schaden löschen" schlug stillschweigend fehl.
--
--  Berechtigung:
--    - damages: nur admin + dispatcher der eigenen Org dürfen löschen
--    - damage_photos: alle internen Rollen (für Cleanup beim Löschen)
--    - order_items: deckt order_items_write (FOR ALL) ab — kein Extra nötig
-- =============================================================================

drop policy if exists damages_delete_internal on public.damages;
create policy damages_delete_internal on public.damages for delete
  using (
    public.current_user_role() in ('admin', 'dispatcher')
    and company_id = public.current_user_company_id()
  );

drop policy if exists photos_delete_internal on public.damage_photos;
create policy photos_delete_internal on public.damage_photos for delete
  using (
    public.is_internal_role()
    and exists (select 1 from public.damages d where d.id = damage_photos.damage_id)
  );
