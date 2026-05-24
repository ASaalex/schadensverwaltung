-- =============================================================================
--  Chat pro Schaden — eigene damage_comments-Tabelle
--
--  Vorher war der Chat an order_comments gebunden = pro Auftrag. Jetzt ist
--  jeder Schaden ein eigener Kommunikations-Thread, den Disposition und Firma
--  parallel nutzen — auch wenn der Schaden später in mehreren Aufträgen
--  auftaucht (z.B. nach Stornierung).
-- =============================================================================

create table if not exists public.damage_comments (
  id          uuid primary key default gen_random_uuid(),
  damage_id   uuid not null references public.damages(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  message     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists damage_comments_damage_idx
  on public.damage_comments(damage_id, created_at desc);

alter table public.damage_comments enable row level security;

-- SELECT: wer den damage sehen darf, sieht auch die Kommentare
drop policy if exists damage_comments_select on public.damage_comments;
create policy damage_comments_select on public.damage_comments for select
  using (exists (select 1 from public.damages d where d.id = damage_comments.damage_id));

-- INSERT: gleiche Bedingung
drop policy if exists damage_comments_insert on public.damage_comments;
create policy damage_comments_insert on public.damage_comments for insert
  with check (exists (select 1 from public.damages d where d.id = damage_id));

-- UPDATE: nur eigene Nachrichten
drop policy if exists damage_comments_update on public.damage_comments;
create policy damage_comments_update on public.damage_comments for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE: nur eigene Nachrichten + interne Rollen können moderieren
drop policy if exists damage_comments_delete on public.damage_comments;
create policy damage_comments_delete on public.damage_comments for delete
  using (user_id = auth.uid() or public.is_internal_role());
