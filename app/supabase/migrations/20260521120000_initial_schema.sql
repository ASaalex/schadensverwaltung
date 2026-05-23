-- =============================================================================
--  Schadensverwaltung — Initial Schema
--  Stand: 2026-05-21
--
--  Reihenfolge:
--   1) Extensions + Enums
--   2) Tabellen (companies → users → categories → damages → orders → …)
--   3) Indizes
--   4) Helper-Funktionen + Trigger
--   5) Row-Level Security
--   6) Storage-Buckets
-- =============================================================================

-- 1) EXTENSIONS ----------------------------------------------------------------
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- 2) ENUMS ---------------------------------------------------------------------
do $$ begin
  create type company_type as enum ('internal_bauhof', 'external_company');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('admin', 'dispatcher', 'field_worker', 'company_user');
exception when duplicate_object then null; end $$;

do $$ begin
  create type damage_status as enum ('neu', 'geprueft', 'zugewiesen', 'bearbeitung', 'erledigt', 'abgelehnt');
exception when duplicate_object then null; end $$;

do $$ begin
  create type priority as enum ('niedrig', 'normal', 'hoch', 'dringend');
exception when duplicate_object then null; end $$;

do $$ begin
  create type geometry_type as enum ('point', 'line', 'polygon');
exception when duplicate_object then null; end $$;

do $$ begin
  create type photo_type as enum ('before', 'after', 'detail');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('entwurf', 'versendet', 'angenommen', 'bearbeitung', 'fertiggemeldet', 'abgeschlossen', 'storniert');
exception when duplicate_object then null; end $$;

do $$ begin
  create type position_status as enum ('offen', 'bearbeitung', 'erledigt', 'uebersprungen');
exception when duplicate_object then null; end $$;

-- 3) TABELLEN ------------------------------------------------------------------

-- 3.1) companies
create table if not exists public.companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  type          company_type not null default 'internal_bauhof',
  contact_email text,
  contact_phone text,
  address       text,
  logo_path     text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 3.2) users (1:1 mit auth.users, erweiterte Stammdaten + Rolle + Mandant)
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete restrict,
  role        user_role not null,
  full_name   text not null,
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists users_company_id_idx on public.users(company_id);

-- 3.3) damage_categories (mehrstufiger Baum, Geometrie-Typ, Custom-Fields)
create table if not exists public.damage_categories (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  parent_id           uuid references public.damage_categories(id) on delete restrict,
  name                text not null,
  code                text,
  description         text,
  sort_order          int not null default 0,
  geometry_type       geometry_type not null default 'point',
  property_schema     jsonb not null default '[]'::jsonb,
    -- Schema-Beispiel:
    -- [{"name":"diameter","label":"Durchmesser","field_type":"decimal","unit":"cm","required":false},
    --  {"name":"material","label":"Material","field_type":"select",
    --   "options":["Asphalt","Pflaster","Beton"],"required":false}]
  default_priority    priority,
  default_company_id  uuid references public.companies(id) on delete set null,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists damage_categories_company_idx on public.damage_categories(company_id);
create index if not exists damage_categories_parent_idx  on public.damage_categories(parent_id);

-- 3.4) sequences pro Jahr (für lesbare Codes SCH-2026-0001 / AUF-2026-0042)
create table if not exists public.code_counters (
  prefix       text not null,        -- 'SCH' | 'AUF'
  year         int  not null,
  last_value   int  not null default 0,
  primary key (prefix, year)
);

create or replace function public.next_code(p_prefix text)
returns text language plpgsql security definer set search_path = public
as $$
declare
  v_year int := extract(year from now())::int;
  v_next int;
begin
  insert into public.code_counters(prefix, year, last_value)
    values (p_prefix, v_year, 1)
    on conflict (prefix, year) do update set last_value = code_counters.last_value + 1
    returning last_value into v_next;
  return p_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
end $$;

-- 3.5) damages
create table if not exists public.damages (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  code                  text unique not null default public.next_code('SCH'),
  category_id           uuid not null references public.damage_categories(id) on delete restrict,
  status                damage_status not null default 'neu',
  priority              priority not null default 'normal',
  -- Position
  gps_lat               numeric(10,7),
  gps_lng               numeric(10,7),
  gps_accuracy_m        numeric(8,2),
  -- Geometrie (NULL bei point-Kategorien)
  geometry              jsonb,                 -- GeoJSON LineString oder Polygon
  -- Custom-Fields-Werte gemäß category.property_schema
  property_values       jsonb not null default '{}'::jsonb,
  -- Adresse
  address_street        text,
  address_house_number  text,
  address_postal_code   text,
  address_city          text,
  address_resolved_at   timestamptz,
  -- Inhalt
  description           text,
  -- Audit / Workflow
  created_by            uuid references public.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  reviewed_by           uuid references public.users(id) on delete set null,
  reviewed_at           timestamptz,
  updated_at            timestamptz not null default now()
);
create index if not exists damages_company_idx       on public.damages(company_id);
create index if not exists damages_status_idx        on public.damages(status);
create index if not exists damages_category_idx      on public.damages(category_id);
create index if not exists damages_created_at_idx    on public.damages(created_at desc);
create index if not exists damages_priority_idx      on public.damages(priority);

-- 3.6) damage_photos
create table if not exists public.damage_photos (
  id            uuid primary key default gen_random_uuid(),
  damage_id     uuid not null references public.damages(id) on delete cascade,
  storage_path  text not null,
  photo_type    photo_type not null,
  taken_at      timestamptz,
  uploaded_by   uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists damage_photos_damage_idx on public.damage_photos(damage_id);

-- 3.7) damage_history (Event Log)
create table if not exists public.damage_history (
  id          uuid primary key default gen_random_uuid(),
  damage_id   uuid not null references public.damages(id) on delete cascade,
  event_type  text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists damage_history_damage_idx on public.damage_history(damage_id, created_at desc);

-- 3.8) orders
create table if not exists public.orders (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references public.companies(id) on delete cascade,
  code                   text unique not null default public.next_code('AUF'),
  title                  text not null,
  description            text,
  assigned_company_id    uuid not null references public.companies(id) on delete restrict,
  status                 order_status not null default 'entwurf',
  planned_start_date     date,
  planned_end_date       date,
  created_by             uuid references public.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  sent_at                timestamptz,
  accepted_at            timestamptz,
  fertiggemeldet_at      timestamptz,
  completed_at           timestamptz,
  updated_at             timestamptz not null default now()
);
create index if not exists orders_company_idx          on public.orders(company_id);
create index if not exists orders_assigned_company_idx on public.orders(assigned_company_id);
create index if not exists orders_status_idx           on public.orders(status);
create index if not exists orders_fertiggemeldet_idx   on public.orders(fertiggemeldet_at) where status = 'fertiggemeldet';

-- 3.9) order_items
create table if not exists public.order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders(id) on delete cascade,
  damage_id             uuid not null references public.damages(id) on delete restrict,
  sort_order            int not null default 0,
  planned_date          date,
  planned_start_time    time,
  planned_end_time      time,
  status                position_status not null default 'offen',
  company_notes         text,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (order_id, damage_id)
);
create index if not exists order_items_order_idx on public.order_items(order_id, sort_order);

-- 3.10) order_history
create table if not exists public.order_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  event_type  text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists order_history_order_idx on public.order_history(order_id, created_at desc);

-- 3.11) order_comments (Kommunikation Disposition ↔ Firma)
create table if not exists public.order_comments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  message     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists order_comments_order_idx on public.order_comments(order_id, created_at);

-- 3.12) map_layers (konfigurierbar pro Mandant)
create table if not exists public.map_layers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,
  type          text not null,                -- 'xyz' | 'wms' | 'wmts'
  url_template  text not null,
  attribution   text,
  min_zoom      int default 0,
  max_zoom      int default 19,
  is_default    boolean not null default false,
  enabled       boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists map_layers_company_idx on public.map_layers(company_id);

-- 3.13) app_settings (Mandanten-Einstellungen wie Auto-Abnahme-Tage)
create table if not exists public.app_settings (
  company_id              uuid primary key references public.companies(id) on delete cascade,
  auto_accept_after_days  int not null default 7,
  max_photos_before       int not null default 5,
  max_photos_after        int not null default 5,
  max_photos_detail       int not null default 5,
  default_map_lat         numeric(10,7),
  default_map_lng         numeric(10,7),
  default_map_zoom        int default 13,
  updated_at              timestamptz not null default now()
);

-- =============================================================================
-- 4) HELPER-FUNKTIONEN + TRIGGER
-- =============================================================================

-- 4.1) updated_at-Trigger
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$ declare t text;
begin
  foreach t in array array['companies','users','damage_categories','damages','orders','order_items','app_settings']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.tg_set_updated_at()', t);
  end loop;
end $$;

-- 4.2) Aktuell angemeldeter Nutzer – Helfer für RLS
create or replace function public.current_user_company_id()
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from public.users where id = auth.uid()
$$;

create or replace function public.current_user_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.is_internal_role()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() in ('admin','dispatcher','field_worker'), false)
$$;

-- 4.3) damage_history-Logger: schreibt automatische Events bei INSERT/UPDATE
create or replace function public.tg_damage_history()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.damage_history(damage_id, event_type, payload, created_by)
      values (new.id, 'created', jsonb_build_object('status', new.status, 'priority', new.priority), new.created_by);
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.damage_history(damage_id, event_type, payload, created_by)
        values (new.id, 'status_changed',
                jsonb_build_object('from', old.status, 'to', new.status), auth.uid());
    end if;
    if new.priority is distinct from old.priority then
      insert into public.damage_history(damage_id, event_type, payload, created_by)
        values (new.id, 'priority_changed',
                jsonb_build_object('from', old.priority, 'to', new.priority), auth.uid());
    end if;
    if new.category_id is distinct from old.category_id then
      insert into public.damage_history(damage_id, event_type, payload, created_by)
        values (new.id, 'category_changed',
                jsonb_build_object('from', old.category_id, 'to', new.category_id), auth.uid());
    end if;
    if new.address_resolved_at is distinct from old.address_resolved_at and new.address_resolved_at is not null then
      insert into public.damage_history(damage_id, event_type, payload, created_by)
        values (new.id, 'address_resolved',
                jsonb_build_object('street', new.address_street, 'city', new.address_city), auth.uid());
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tg_damage_history on public.damages;
create trigger tg_damage_history
  after insert or update on public.damages
  for each row execute function public.tg_damage_history();

-- 4.4) order_history-Logger
create or replace function public.tg_order_history()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_history(order_id, event_type, payload, created_by)
      values (new.id, 'created', jsonb_build_object('status', new.status), new.created_by);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.order_history(order_id, event_type, payload, created_by)
      values (new.id, 'status_changed',
              jsonb_build_object('from', old.status, 'to', new.status), auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists tg_order_history on public.orders;
create trigger tg_order_history
  after insert or update on public.orders
  for each row execute function public.tg_order_history();

-- =============================================================================
-- 5) ROW-LEVEL SECURITY
-- =============================================================================
alter table public.companies          enable row level security;
alter table public.users              enable row level security;
alter table public.damage_categories  enable row level security;
alter table public.damages            enable row level security;
alter table public.damage_photos      enable row level security;
alter table public.damage_history     enable row level security;
alter table public.orders             enable row level security;
alter table public.order_items        enable row level security;
alter table public.order_history      enable row level security;
alter table public.order_comments     enable row level security;
alter table public.map_layers         enable row level security;
alter table public.app_settings       enable row level security;

-- Grundprinzip:
--   * Interne Rollen (admin/dispatcher/field_worker): alles innerhalb der eigenen Organisation
--   * company_user: nur Orders + Items + Comments + zugeordnete Damages der eigenen Firma

-- 5.1) companies — eigene Org sichtbar; admin darf editieren
drop policy if exists companies_select_own on public.companies;
create policy companies_select_own on public.companies for select using (
  id = public.current_user_company_id()
  -- externe Firma sieht die Auftraggeber-Org der ihr zugewiesenen Aufträge:
  or exists (
    select 1 from public.orders o
    where o.assigned_company_id = public.current_user_company_id()
      and o.company_id = companies.id
  )
);
drop policy if exists companies_admin_write on public.companies;
create policy companies_admin_write on public.companies for all using (
  public.current_user_role() = 'admin' and id = public.current_user_company_id()
) with check (
  public.current_user_role() = 'admin'
);

-- 5.2) users — eigene Org-User sichtbar; admin darf editieren
drop policy if exists users_select_own_org on public.users;
create policy users_select_own_org on public.users for select using (
  company_id = public.current_user_company_id()
);
drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users for all using (
  public.current_user_role() = 'admin' and company_id = public.current_user_company_id()
) with check (
  public.current_user_role() = 'admin' and company_id = public.current_user_company_id()
);

-- 5.3) damage_categories — alle internen Rollen lesen; admin schreibt
drop policy if exists categories_select on public.damage_categories;
create policy categories_select on public.damage_categories for select using (
  company_id = public.current_user_company_id() and public.is_internal_role()
);
drop policy if exists categories_admin_write on public.damage_categories;
create policy categories_admin_write on public.damage_categories for all using (
  public.current_user_role() = 'admin' and company_id = public.current_user_company_id()
) with check (
  public.current_user_role() = 'admin' and company_id = public.current_user_company_id()
);

-- 5.4) damages
drop policy if exists damages_select_internal on public.damages;
create policy damages_select_internal on public.damages for select using (
  public.is_internal_role() and company_id = public.current_user_company_id()
);
drop policy if exists damages_select_company on public.damages;
create policy damages_select_company on public.damages for select using (
  public.current_user_role() = 'company_user'
  and exists (
    select 1 from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.damage_id = damages.id
      and o.assigned_company_id = public.current_user_company_id()
  )
);
drop policy if exists damages_insert_internal on public.damages;
create policy damages_insert_internal on public.damages for insert with check (
  public.is_internal_role() and company_id = public.current_user_company_id()
);
drop policy if exists damages_update_internal on public.damages;
create policy damages_update_internal on public.damages for update using (
  public.is_internal_role() and company_id = public.current_user_company_id()
);

-- 5.5) damage_photos — wer das Damage sehen darf, sieht auch die Fotos
drop policy if exists photos_select on public.damage_photos;
create policy photos_select on public.damage_photos for select using (
  exists (select 1 from public.damages d where d.id = damage_photos.damage_id)
);
drop policy if exists photos_insert on public.damage_photos;
create policy photos_insert on public.damage_photos for insert with check (
  exists (select 1 from public.damages d where d.id = damage_id)
);

-- 5.6) damage_history
drop policy if exists history_select on public.damage_history;
create policy history_select on public.damage_history for select using (
  exists (select 1 from public.damages d where d.id = damage_history.damage_id)
);

-- 5.7) orders
drop policy if exists orders_select_internal on public.orders;
create policy orders_select_internal on public.orders for select using (
  public.is_internal_role() and company_id = public.current_user_company_id()
);
drop policy if exists orders_select_company on public.orders;
create policy orders_select_company on public.orders for select using (
  public.current_user_role() = 'company_user'
  and assigned_company_id = public.current_user_company_id()
  and status <> 'entwurf'
);
drop policy if exists orders_write_dispatcher on public.orders;
create policy orders_write_dispatcher on public.orders for all using (
  public.current_user_role() in ('admin','dispatcher')
  and company_id = public.current_user_company_id()
) with check (
  public.current_user_role() in ('admin','dispatcher')
  and company_id = public.current_user_company_id()
);
drop policy if exists orders_update_company on public.orders;
create policy orders_update_company on public.orders for update using (
  public.current_user_role() = 'company_user'
  and assigned_company_id = public.current_user_company_id()
);

-- 5.8) order_items — analog orders
drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_items.order_id)
);
drop policy if exists order_items_write on public.order_items;
create policy order_items_write on public.order_items for all using (
  exists (select 1 from public.orders o where o.id = order_id
          and ( (public.is_internal_role() and o.company_id = public.current_user_company_id())
             or (public.current_user_role() = 'company_user' and o.assigned_company_id = public.current_user_company_id()) ))
) with check (
  exists (select 1 from public.orders o where o.id = order_id
          and ( (public.is_internal_role() and o.company_id = public.current_user_company_id())
             or (public.current_user_role() = 'company_user' and o.assigned_company_id = public.current_user_company_id()) ))
);

-- 5.9) order_history
drop policy if exists order_history_select on public.order_history;
create policy order_history_select on public.order_history for select using (
  exists (select 1 from public.orders o where o.id = order_history.order_id)
);

-- 5.10) order_comments
drop policy if exists order_comments_select on public.order_comments;
create policy order_comments_select on public.order_comments for select using (
  exists (select 1 from public.orders o where o.id = order_comments.order_id)
);
drop policy if exists order_comments_insert on public.order_comments;
create policy order_comments_insert on public.order_comments for insert with check (
  exists (select 1 from public.orders o where o.id = order_id)
);

-- 5.11) map_layers — alle authentifizierten Nutzer der Org lesen
drop policy if exists map_layers_select on public.map_layers;
create policy map_layers_select on public.map_layers for select using (
  company_id = public.current_user_company_id() and enabled = true
);
drop policy if exists map_layers_admin_write on public.map_layers;
create policy map_layers_admin_write on public.map_layers for all using (
  public.current_user_role() = 'admin' and company_id = public.current_user_company_id()
) with check (
  public.current_user_role() = 'admin' and company_id = public.current_user_company_id()
);

-- 5.12) app_settings
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select using (
  company_id = public.current_user_company_id()
);
drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_write on public.app_settings for all using (
  public.current_user_role() = 'admin' and company_id = public.current_user_company_id()
) with check (
  public.current_user_role() = 'admin' and company_id = public.current_user_company_id()
);

-- =============================================================================
-- 6) STORAGE-BUCKETS
-- =============================================================================
insert into storage.buckets (id, name, public) values ('damage-photos', 'damage-photos', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('company-logos', 'company-logos', true)
  on conflict (id) do nothing;

-- Storage-Policies: nur eingeloggte Nutzer dürfen lesen/schreiben in damage-photos
drop policy if exists "damage_photos_read_auth" on storage.objects;
create policy "damage_photos_read_auth" on storage.objects for select to authenticated
  using (bucket_id = 'damage-photos');

drop policy if exists "damage_photos_insert_auth" on storage.objects;
create policy "damage_photos_insert_auth" on storage.objects for insert to authenticated
  with check (bucket_id = 'damage-photos');

drop policy if exists "damage_photos_delete_internal" on storage.objects;
create policy "damage_photos_delete_internal" on storage.objects for delete to authenticated
  using (bucket_id = 'damage-photos' and public.is_internal_role());
